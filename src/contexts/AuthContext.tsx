import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/supabase';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, role: 'admin' | 'student') => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isStudent: boolean;
  retry: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const checkEnvironmentVariables = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ Missing Supabase environment variables');
      setError('Configuration Error: Supabase environment variables are missing. Please check your deployment configuration.');
      setLoading(false);
      return false;
    }
    
    if (supabaseUrl.includes('undefined') || supabaseAnonKey.includes('undefined')) {
      console.error('❌ Invalid Supabase environment variables');
      setError('Configuration Error: Supabase environment variables are invalid. Please check your deployment configuration.');
      setLoading(false);
      return false;
    }
    
    return true;
  };

  const fetchUserProfile = async (userId: string): Promise<Profile | null> => {
    try {
      console.log('🔄 Fetching profile for user:', userId);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('❌ Error fetching profile:', error);
        if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
          setError('Network Error: Unable to connect to the database. Please check your internet connection and try again.');
        }
        return null;
      }

      console.log('✅ Profile fetched successfully:', data.role);
      return data;
    } catch (error) {
      console.error('❌ Error fetching profile:', error);
      setError('Network Error: Unable to fetch user profile. Please try again.');
      return null;
    }
  };

  const retry = () => {
    setError(null);
    setRetryCount(prev => prev + 1);
  };

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const initializeAuth = async () => {
      try {
        console.log('🔄 Initializing auth...');
        setError(null);
        
        // Check environment variables first
        if (!checkEnvironmentVariables()) {
          return;
        }

        // Set a timeout to prevent infinite loading
        timeoutId = setTimeout(() => {
          if (mounted && loading) {
            console.log('⏰ Auth initialization timeout');
            setError('Connection Timeout: Unable to connect to authentication service. Please try again.');
            setLoading(false);
          }
        }, 10000); // 10 second timeout
        
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        clearTimeout(timeoutId);
        
        if (error) {
          console.error('❌ Error getting session:', error);
          if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
            setError('Network Error: Unable to connect to authentication service. Please check your internet connection and try again.');
          } else {
            setError(`Authentication Error: ${error.message}`);
          }
          setUser(null);
          setProfile(null);
          setSession(null);
          setLoading(false);
          return;
        }

        if (currentSession?.user) {
          console.log('✅ Found existing session for user:', currentSession.user.id);
          setSession(currentSession);
          setUser(currentSession.user);
          
          const userProfile = await fetchUserProfile(currentSession.user.id);
          if (mounted) {
            setProfile(userProfile);
          }
        } else {
          console.log('ℹ️ No existing session found');
          setUser(null);
          setProfile(null);
          setSession(null);
        }
      } catch (error) {
        console.error('❌ Error initializing auth:', error);
        if (mounted) {
          if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('network'))) {
            setError('Network Error: Unable to connect to authentication service. Please check your internet connection and try again.');
          } else {
            setError('Authentication Error: An unexpected error occurred. Please try again.');
          }
          setUser(null);
          setProfile(null);
          setSession(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    const handleAuthStateChange = async (event: string, newSession: Session | null) => {
      if (!mounted) return;
      
      console.log('🔄 Auth state change:', event, newSession?.user?.id || 'no user');
      
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setError(null);
      
      if (newSession?.user) {
        try {
          const userProfile = await fetchUserProfile(newSession.user.id);
          if (mounted) {
            setProfile(userProfile);
          }
        } catch (error) {
          console.error('❌ Error fetching profile in auth change:', error);
          if (mounted) {
            setProfile(null);
          }
        }
      } else {
        setProfile(null);
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Initialize auth
    initializeAuth();

    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription.unsubscribe();
    };
  }, [retryCount]); // Re-run when retry is called

  const signIn = async (email: string, password: string) => {
    try {
      console.log('🔄 Starting sign in process...');
      setError(null);
      
      // Check environment variables
      if (!checkEnvironmentVariables()) {
        return { error: new Error('Configuration error: Missing environment variables') };
      }
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      
      if (error) {
        console.error('❌ Sign in error:', error);
        if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
          setError('Network Error: Unable to connect to authentication service. Please check your internet connection and try again.');
        }
        return { error };
      }
      
      if (!data.user || !data.session) {
        console.error('❌ No user or session returned');
        return { error: new Error('Authentication failed') };
      }
      
      console.log('✅ Sign in successful for user:', data.user.id);
      return { error: null };
      
    } catch (error) {
      console.error('❌ Unexpected sign in error:', error);
      if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('network'))) {
        setError('Network Error: Unable to connect to authentication service. Please check your internet connection and try again.');
      }
      return { error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, role: 'admin' | 'student') => {
    try {
      console.log('🔄 Starting sign up process...');
      setError(null);
      
      // Check environment variables
      if (!checkEnvironmentVariables()) {
        return { error: new Error('Configuration error: Missing environment variables') };
      }
      
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
          setError('Network Error: Unable to connect to authentication service. Please check your internet connection and try again.');
        }
        return { error };
      }

      if (data.user) {
        // Create profile
        const profileData = {
          id: data.user.id,
          email: email.trim(),
          full_name: fullName,
          role,
        };

        const { error: profileError } = await supabase
          .from('profiles')
          .insert(profileData);

        if (profileError) {
          console.error('❌ Error creating profile:', profileError);
          return { error: profileError };
        }
        
        console.log('✅ Sign up successful');
      }

      return { error: null };
    } catch (error) {
      console.error('❌ Sign up error:', error);
      if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('network'))) {
        setError('Network Error: Unable to connect to authentication service. Please check your internet connection and try again.');
      }
      return { error };
    }
  };

  const signOut = async () => {
    try {
      console.log('🔄 Starting sign out process...');
      setError(null);
      
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('❌ Sign out error:', error);
      } else {
        console.log('✅ Sign out successful');
      }
      
      // Clear state immediately
      setUser(null);
      setProfile(null);
      setSession(null);
      
    } catch (error) {
      console.error('❌ Sign out error:', error);
    }
  };

  const isAdmin = profile?.role === 'admin';
  const isStudent = profile?.role === 'student';

  const value = {
    user,
    profile,
    session,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    isAdmin,
    isStudent,
    retry,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}