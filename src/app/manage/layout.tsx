import { getServerSession } from 'next-auth';
import { authOptions } from '../lib/auth';
import './page.css';
import { redirect } from 'next/navigation';

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
    <div>{children}</div>
  );
}