import { redirect } from 'next/navigation';
import { getSession } from '../lib/session';
import { lexend } from '../lib/fonts';
import '../../../styles/Manage.css';

export default async function ManagementLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const user = session?.user;
  if (!user || !user.isAdmin) {
    redirect(user ? '/' : '/login');
  }
  return (
    <div className={`mg-page ${lexend.variable}`}>{children}</div>
  );
}
