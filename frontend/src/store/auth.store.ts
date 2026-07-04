// src/store/auth.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../lib/api';
import { UserRole } from '@/types/shared';

interface User {
  id: string;
  email: string;
  role: UserRole;
  staff?: {
    id: string;
    firstName: string;
    lastName: string;
    specialization?: string;
    avatar?: string;
  };
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
}

// ... (imports and interfaces stay the same)

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      token: null,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const data = await authApi.login({ email, password });
          
          // 1. Save all required tokens to localStorage
          localStorage.setItem('access_token', data.accessToken);
          localStorage.setItem('refresh_token', data.refreshToken);
          
          // 2. THIS IS REQUIRED FOR YOUR INTERCEPTOR TO WORK
          localStorage.setItem('user_id', data.user.id); 

          // 3. Fix the syntax error and properly update Zustand state
          set({ 
            user: data.user, 
            token: data.accessToken, // Moved inside set() and fixed naming
            isAuthenticated: true, 
            isLoading: false 
          });
          
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try { await authApi.logout(); } catch {}
        
        // Clear everything!
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_id'); // Don't forget to clear this too
        
        set({ user: null, token: null, isAuthenticated: false });
      },

      loadUser: async () => {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        set({ isLoading: true });
        try {
          const user = await authApi.me();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          // If the me() route fails (and the interceptor couldn't refresh), clear it all
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user_id');
          set({ user: null, token: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    { 
      name: 'dhms-auth', 
      partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }) 
    }
  )
);

// export const useAuthStore = create<AuthState>()(
//   persist(
//     (set) => ({
//       user: null,
//       isAuthenticated: false,
//       isLoading: false,
//       token: null,

//       login: async (email, password) => {
//         set({ isLoading: true });
//         try {
//           const data = await authApi.login({ email, password });
//           localStorage.setItem('access_token', data.accessToken);
//           localStorage.setItem('refresh_token', data.refreshToken);
//           token: data.access_token,
//           set({ user: data.user, isAuthenticated: true, isLoading: false });
//         } catch (err) {
//           set({ isLoading: false });
//           throw err;
//         }
//       },

//       logout: async () => {
//         try { await authApi.logout(); } catch {}
//         localStorage.removeItem('access_token');
//         localStorage.removeItem('refresh_token');
//         set({ user: null, isAuthenticated: false });
//       },

//       loadUser: async () => {
//         const token = localStorage.getItem('access_token');
//         if (!token) return;
//         try {
//           const user = await authApi.me();
//           set({ user, isAuthenticated: true });
//         } catch {
//           localStorage.clear();
//           set({ user: null, isAuthenticated: false });
//         }
//       },
//     }),
//     { name: 'dhms-auth', partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }) }
//   )
// );
