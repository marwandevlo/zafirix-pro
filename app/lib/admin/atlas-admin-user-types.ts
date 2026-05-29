/** Admin users API + UI — mirrors `public.profiles` (+ email from auth.users). */
export type AdminProfileUser = {
  id: string;
  email: string;
  role: string;
  plan: string;
  status: string;
  full_name: string;
  company_name: string;
  created_at: string;
};
