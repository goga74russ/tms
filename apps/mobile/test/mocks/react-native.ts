/** Minimal react-native mock — only the surface our code-under-test uses. */
export const Alert = {
    alert: (..._args: unknown[]): void => {
        /* no-op */
    },
};

export const Platform = {
    OS: 'ios' as 'ios' | 'android' | 'web',
    select: <T,>(opts: { ios?: T; android?: T; default?: T }): T | undefined =>
        opts.ios ?? opts.default,
};
