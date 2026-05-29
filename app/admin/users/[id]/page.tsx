import { Suspense } from 'react';
import UserDetailsAdminClient from '@/app/admin/users/[id]/user-details-client';

export default function AdminUserDetailsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <UserDetailsAdminClient />
    </Suspense>
  );
}
