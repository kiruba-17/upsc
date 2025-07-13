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
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, role: 'admin' | 'student') => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isStudent: boolean;
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
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        console.log('🔄 Initializing auth...');
        
        // Get initial session
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (error) {
          console.error('❌ Error getting session:', error);
          if (mounted) {
            setUser(null);
            setProfile(null);
            setSession(null);
            setLoading(false);
            setInitialized(true);
          }
          return;
        }

        if (currentSession?.user) {
          console.log('✅ Found existing session for user:', currentSession.user.id);
          setSession(currentSession);
          setUser(currentSession.user);
          
          // Fetch profile
          await fetchUserProfile(currentSession.user.id);
        } else {
          console.log('ℹ️ No existing session found');
          if (mounted) {
            setUser(null);
            setProfile(null);
            setSession(null);
            setLoading(false);
            setInitialized(true);
          }
        }
      } catch (error) {
        console.error('❌ Error initializing auth:', error);
        if (mounted) {
          setUser(null);
          setProfile(null);
          setSession(null);
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    const fetchUserProfile = async (userId: string) => {
      if (!mounted) return;
      
      try {
        console.log('🔄 Fetching profile for user:', userId);
        
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (!mounted) return;

        if (error) {
          if (error.code === 'PGRST116') {
            console.log('⚠️ Profile not found for user:', userId);
          } else {
            console.error('❌ Error fetching profile:', error);
          }
          setProfile(null);
        } else {
          console.log('✅ Profile fetched successfully:', data.role);
          setProfile(data);
        }
      } catch (error) {
        console.error('❌ Error fetching profile:', error);
        if (mounted) {
          setProfile(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    const handleAuthStateChange = async (event: string, newSession: Session | null) => {
      if (!mounted) return;
      
      console.log('🔄 Auth state change:', event, newSession?.user?.id || 'no user');
      
      // Don't process auth changes until we've initialized
      if (!initialized && event !== 'INITIAL_SESSION') {
        return;
      }
      
      setSession(newSession);
      setUser(newSession?.user ?? null);
      
      if (newSession?.user) {
        setLoading(true);
        await fetchUserProfile(newSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Initialize auth
    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      console.log('🔄 Starting sign in process...');
      setLoading(true);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      
      if (error) {
        console.error('❌ Sign in error:', error);
        setLoading(false);
        return { error };
      }
      
      if (!data.user || !data.session) {
        console.error('❌ No user or session returned');
        setLoading(false);
        return { error: new Error('Authentication failed') };
      }
      
      console.log('✅ Sign in successful for user:', data.user.id);
      return { error: null };
      
    } catch (error) {
      console.error('❌ Unexpected sign in error:', error);
      setLoading(false);
      return { error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, role: 'admin' | 'student') => {
    try {
      console.log('🔄 Starting sign up process...');
      setLoading(true);
      
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        setLoading(false);
        return { error };
      }

      if (data.user) {
        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: email.trim(),
            full_name: fullName,
            role,
          });

        if (profileError) {
          console.error('❌ Error creating profile:', profileError);
          setLoading(false);
          return { error: profileError };
        }
        
        console.log('✅ Sign up successful');
      }

      setLoading(false);
      return { error: null };
    } catch (error) {
      console.error('❌ Sign up error:', error);
      setLoading(false);
      return { error };
    }
  };

  const signOut = async () => {
    try {
      console.log('🔄 Starting sign out process...');
      setLoading(true);
      
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
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = profile?.role === 'admin';
  const isStudent = profile?.role === 'student';

  const value = {
    user,
    profile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin,
    isStudent,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}