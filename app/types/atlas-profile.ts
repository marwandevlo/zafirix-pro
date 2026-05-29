/** Canonical user profile row (`public.profiles`). */
export type AtlasProfile = {
  id: string;
  email: string;
  role: string;
  plan: string;
  status: string;
  full_name: string;
  company_name: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

/** Fields a signed-in user may update via `/api/profile` or client repository. */
export type AtlasProfileUserPatch = {
  full_name?: string;
  company_name?: string;
  onboarding_completed?: boolean;
};
