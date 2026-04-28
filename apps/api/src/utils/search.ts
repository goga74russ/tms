export function escapeLikePattern(value: string) {
    return value.replace(/[\\%_]/g, '\\$&');
}

export function containsLikePattern(value: string) {
    return `%${escapeLikePattern(value)}%`;
}
