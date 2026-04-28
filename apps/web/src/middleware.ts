import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicRoutes = ['/login', '/_not-found'];
const excludedPrefixes = ['/api', '/_next/static', '/_next/image', '/favicon.ico'];
const internalApiUrl = process.env.INTERNAL_API_URL?.replace(/\/+$/, '');

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

async function fetchSession(request: NextRequest) {
    const url = internalApiUrl
        ? `${internalApiUrl}/auth/me`
        : new URL('/api/auth/me', request.url).toString();

    const response = await fetch(url, {
        headers: {
            cookie: request.headers.get('cookie') || '',
            host: request.headers.get('host') || '',
        },
        cache: 'no-store',
    }).catch(() => null);

    if (!response?.ok) return null;
    const payload = await response.json().catch(() => null);
    return payload?.success ? payload.data as { roles?: string[] } : null;
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (excludedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
        return NextResponse.next();
    }

    if (publicRoutes.includes(pathname)) {
        return NextResponse.next();
    }

    const token = request.cookies.get('tms_token');
    if (!token || token.value.split('.').length !== 3) {
        const url = new URL('/login', request.url);
        return NextResponse.redirect(url);
    }

    const session = await fetchSession(request);
    if (!session) {
        const url = new URL('/login', request.url);
        return NextResponse.redirect(url);
    }

    if (!hasAccess(pathname, session.roles || [])) {
        const url = new URL('/', request.url);
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
