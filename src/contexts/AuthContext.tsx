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

  // Cache for profiles to avoid repeated fetches
  const [profileCache, setProfileCache] = useState<Map<string, Profile>>(new Map());

  useEffect(() => {
    let mounted = true;

    const fetchUserProfile = async (userId: string): Promise<Profile | null> => {
      // Check cache first
      if (profileCache.has(userId)) {
        console.log('✅ Using cached profile for user:', userId);
        return profileCache.get(userId)!;
      }

      try {
        console.log('🔄 Fetching profile for user:', userId);
        
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            console.log('⚠️ Profile not found for user:', userId);
          } else {
            console.error('❌ Error fetching profile:', error);
          }
          return null;
        }

        console.log('✅ Profile fetched successfully:', data.role);
        
        // Cache the profile
        setProfileCache(prev => new Map(prev).set(userId, data));
        
        return data;
      } catch (error) {
        console.error('❌ Error fetching profile:', error);
        return null;
      }
    };

    const initializeAuth = async () => {
      try {
        console.log('🔄 Initializing auth...');
        
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (error) {
          console.error('❌ Error getting session:', error);
          setUser(null);
          setProfile(null);
          setSession(null);
          setLoading(false);
          setInitialized(true);
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
          setUser(null);
          setProfile(null);
          setSession(null);
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
      
      // Always update session and user immediately
      setSession(newSession);
      setUser(newSession?.user ?? null);
      
      if (newSession?.user) {
        // Don't set loading for profile fetch on sign in - keep UI responsive
        const userProfile = await fetchUserProfile(newSession.user.id);
        if (mounted) {
          setProfile(userProfile);
        }
      } else {
        setProfile(null);
      }
    };

    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Then initialize
    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      console.log('🔄 Starting sign in process...');
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      
      if (error) {
        console.error('❌ Sign in error:', error);
        return { error };
      }
      
      if (!data.user || !data.session) {
        console.error('❌ No user or session returned');
        return { error: new Error('Authentication failed') };
      }
      
      console.log('✅ Sign in successful for user:', data.user.id);
      
      // Immediately update state for faster UI response
      setSession(data.session);
      setUser(data.user);
      
      // Fetch profile in background
      const userProfile = await fetchUserProfile(data.user.id);
      setProfile(userProfile);
      
      return { error: null };
      
    } catch (error) {
      console.error('❌ Unexpected sign in error:', error);
      return { error };
    }
  };

  const fetchUserProfile = async (userId: string): Promise<Profile | null> => {
    // Check cache first
    if (profileCache.has(userId)) {
      console.log('✅ Using cached profile for user:', userId);
      return profileCache.get(userId)!;
    }

    try {
      console.log('🔄 Fetching profile for user:', userId);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('⚠️ Profile not found for user:', userId);
        } else {
          console.error('❌ Error fetching profile:', error);
        }
        return null;
      }

      console.log('✅ Profile fetched successfully:', data.role);
      
      // Cache the profile
      setProfileCache(prev => new Map(prev).set(userId, data));
      
      return data;
    } catch (error) {
      console.error('❌ Error fetching profile:', error);
      return null;
    }
  };

  const signUp = async (email: string, password: string, fullName: string, role: 'admin' | 'student') => {
    try {
      console.log('🔄 Starting sign up process...');
      
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
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
        
        // Cache the new profile
        setProfileCache(prev => new Map(prev).set(data.user.id, {
          ...profileData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
        
        console.log('✅ Sign up successful');
      }

      return { error: null };
    } catch (error) {
      console.error('❌ Sign up error:', error);
      return { error };
    }
  };

  const signOut = async () => {
    try {
      console.log('🔄 Starting sign out process...');
      
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('❌ Sign out error:', error);
      } else {
        console.log('✅ Sign out successful');
      }
      
      // Clear state and cache immediately
      setUser(null);
      setProfile(null);
      setSession(null);
      setProfileCache(new Map());
      
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
    signIn,
    signUp,
    signOut,
    isAdmin,
    isStudent,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}