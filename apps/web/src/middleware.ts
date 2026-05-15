import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// ----------------------------------------------------------------
// Edge JWT verification (Phase 1 stabilization).
//
// Previously this middleware made a server-side fetch to /auth/me on
// every page navigation. That was slow (extra hop, no caching) and
// brittle (failed when the API was momentarily unavailable). We now
// verify the `tms_token` cookie locally on the edge using `jose`, the
// same JWT library family used by `@fastify/jwt` on the API side.
//
// IMPORTANT: `JWT_SECRET` must be exposed to the Next.js runtime —
// add it to the same env file used by `next dev` / `next start`. It
// must match the secret used by @tms/api for tokens to verify.
// ----------------------------------------------------------------

// Root '/' is public so RootPage (app/page.tsx) can redirect unauthenticated
// visitors to /landing (and authenticated users to their role dashboard).
// Without this, middleware fires before RootPage and forces /login.
const publicRoutes = ['/', '/about', '/status', '/login', '/_not-found', '/signup', '/signup/verify', '/onboarding', '/landing', '/forgot-password', '/reset-password'];
const publicPrefixes = ['/legal/'];
const excludedPrefixes = ['/api', '/_next/static', '/_next/image', '/favicon.ico'];

const routeRoles: Array<[string, string[]]> = [
    ['/admin', ['admin']],
    ['/client', ['client']],
    ['/mechanic', ['mechanic']],
    ['/medic', ['medic']],
    ['/repair', ['repair_service', 'mechanic']],
    ['/dispatcher', ['dispatcher']],
    ['/logist', ['logist']],
    ['/finance', ['accountant', 'manager']],
    ['/tariffs', ['accountant', 'manager', 'logist']],
    ['/contractors', ['accountant', 'logist']],
];

function hasAccess(pathname: string, roles: string[]) {
    if (roles.includes('admin')) return true;
    const match = routeRoles.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (!match) return true;
    return match[1].some((role) => roles.includes(role));
}

interface TmsJwtPayload {
    roles?: string[];
    userId?: string;
    organizationId?: string | null;
}

let cachedSecret: Uint8Array | null = null;
function getJwtSecret(): Uint8Array | null {
    if (cachedSecret) return cachedSecret;
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    cachedSecret = new TextEncoder().encode(secret);
    return cachedSecret;
}

async function verifySessionToken(rawToken: string): Promise<TmsJwtPayload | null> {
    const secret = getJwtSecret();
    if (!secret) return null;
    try {
        const { payload } = await jwtVerify(rawToken, secret);
        return payload as TmsJwtPayload;
    } catch {
        return null;
    }
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (excludedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
        return NextResponse.next();
    }

    if (publicRoutes.includes(pathname)) {
        return NextResponse.next();
    }

    if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) {
        return NextResponse.next();
    }

    const tokenCookie = request.cookies.get('tms_token');
    const rawToken = tokenCookie?.value;
    if (!rawToken || rawToken.split('.').length !== 3) {
        const url = new URL('/login', request.url);
        return NextResponse.redirect(url);
    }

    const session = await verifySessionToken(rawToken);
    if (!session) {
        const url = new URL('/login', request.url);
        return NextResponse.redirect(url);
    }

    if (!hasAccess(pathname, session.roles ?? [])) {
        const url = new URL('/', request.url);
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
