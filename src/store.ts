import { create } from 'zustand';
import { Role, FarmMember } from './types';

interface AuthState {
  user: any | null;
  role: Role | null;
  member: FarmMember | null;
  isLoading: boolean;
  setUser: (user: any) => void;
  setRole: (role: Role | null) => void;
  setMember: (member: FarmMember | null) => void;
  setLoading: (isLoading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  member: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setRole: (role) => set({ role }),
  setMember: (member) => set({ member }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => set({ user: null, role: null, member: null }),
}));
