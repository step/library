import NeonAdapter from '@auth/neon-adapter';
import { AuthOptions } from 'next-auth';
import Google from 'next-auth/providers/google';
import { checkIsUserAdmin, checkUserExists } from '../../../db/user';
import { pool } from './db';

export type User = {
    id: number;
    name: string;
    email: string;
    image: string;
    isRoot: boolean;
}

export const authOptions: AuthOptions = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter: NeonAdapter(pool) as any,
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],
    session: {
        strategy: 'database',
    },
    callbacks: {
        async signIn({ profile }) {
            const email = profile?.email;
            if (!email) return false;
            return checkUserExists(email);
        },
        async session({ session, user }) {
            if (user) {
                session.user.isAdmin = await checkIsUserAdmin(user.email);
            }
            return session;
        },
    }
};