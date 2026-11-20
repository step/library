import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

/**
 * The signed-in session, looked up once per server render. A lookup costs three database
 * queries (session, NextAuth user, admin flag), and the root layout, the /manage layout and
 * the page all need it. Outside a render (API routes) React does not cache, so each call
 * looks it up again.
 */
export const getSession = cache(() => getServerSession(authOptions));
