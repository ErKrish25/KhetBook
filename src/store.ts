import { create } from 'zustand';
import { Role, FarmMember } from './types';

interface AuthState {
  user: any | null;
  role: Role | null;
  member: FarmMember | null;
  ownerId: string | null; // The owner's user_id — same as user.id for owner, different for family
  isLoading: boolean;
  hasSeenTour: boolean;
  setUser: (user: any) => void;
  setRole: (role: Role | null) => void;
  setMember: (member: FarmMember | null) => void;
  setOwnerId: (id: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  completeTour: () => void;
  resetTour: () => void;
  logout: () => void;
  /** Returns the ID to use for all data queries (owner's ID for both owner and family) */
  getDataOwnerId: () => string | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  role: null,
  member: null,
  ownerId: null,
  isLoading: true,
  hasSeenTour: false,
  setUser: (user) => set({ user }),
  setRole: (role) => set({ role }),
  setMember: (member) => set({ member }),
  setOwnerId: (ownerId) => set({ ownerId }),
  setLoading: (isLoading) => set({ isLoading }),
  completeTour: () => set({ hasSeenTour: true }),
  resetTour: () => set({ hasSeenTour: false }),
  logout: () => set({ user: null, role: null, member: null, ownerId: null }),
  getDataOwnerId: () => {
    const state = get();
    // Family members use the ownerId; owners use their own user.id
    return state.ownerId || state.user?.id || null;
  },
}));
