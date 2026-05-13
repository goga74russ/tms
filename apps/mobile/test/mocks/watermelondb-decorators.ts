/** @nozbe/watermelondb/decorators stub — every decorator is a no-op. */

type Dec = (...args: any[]) => any;

const make = (): Dec => () => undefined as any;

export const field = make();
export const date = make();
export const text = make();
export const json = make();
export const readonly = make();
export const immutableRelation = make();
export const relation = make();
export const children = make();
export const action = make();
export const lazy = make();
export const writer = make();
export const reader = make();
