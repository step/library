import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '../lib/auth';
import { lexend } from '../lib/fonts';
import '../../../styles/Manage.css';

export default async function ManagementLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user || !user.isAdmin) {
    redirect(user ? '/' : '/login');
  }
  return (
    <div className={`mg-page ${lexend.variable}`}>{children}</div>
  );
}
