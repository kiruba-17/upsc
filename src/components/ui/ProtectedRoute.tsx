import React, { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireStudent?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false, requireStudent = false }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();

  console.log('🔍 ProtectedRoute check:', { 
    hasUser: !!user, 
    hasProfile: !!profile, 
    loading, 
    userRole: profile?.role 
  });

  // Show loading spinner while auth is being determined
  if (loading) {
    console.log('⏳ ProtectedRoute: Still loading auth state');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if no user
  if (!user) {
    console.log('🚫 ProtectedRoute: No user, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  // If user exists but no profile, show error
  if (!profile) {
    console.log('🚫 ProtectedRoute: User exists but no profile found');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Profile Not Found</h2>
          <p className="text-gray-600 mb-4">Your user profile could not be loaded.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Check role-based access
  if (requireAdmin && profile.role !== 'admin') {
    console.log('🚫 ProtectedRoute: Admin required but user is not admin');
    return <Navigate to="/dashboard" replace />;
  }

  if (requireStudent && profile.role !== 'student') {
    console.log('🚫 ProtectedRoute: Student required but user is not student');
    return <Navigate to="/admin" replace />;
  }

  console.log('✅ ProtectedRoute: Access granted');
  return <>{children}</>;
}