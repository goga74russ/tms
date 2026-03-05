import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define public routes that do not require authentication
const publicRoutes = ['/login', '/_not-found'];

// Define static and API routes to exclude from middleware
const excludedPrefixes = ['/api', '/_next/static', '/_next/image', '/favicon.ico'];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Fast return if it's an excluded static or API path
    if (excludedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
        return NextResponse.next();
    }

    // Fast return if it's a public route
    if (publicRoutes.includes(pathname)) {
        // If logged in and trying to access /login, redirect to /
        const token = request.cookies.get('tms_token');
        if (token && pathname === '/login') {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return NextResponse.next();
    }

    // It is a protected route. Check for the tms_token cookie.
    const token = request.cookies.get('tms_token');

    if (!token) {
        // Redirect to /login if no valid cookie is found
        const url = new URL('/login', request.url);
        return NextResponse.redirect(url);
    }

    // Allow access to protected route
    return NextResponse.next();
}

export const config = {
    // Matcher ensures the middleware runs on all paths,
    // although we filter out static files above for extra safety/performance
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
