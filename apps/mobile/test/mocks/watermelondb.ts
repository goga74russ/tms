/**
 * @nozbe/watermelondb mock — exposes `Q` query builders as no-op tags so
 * code like `Q.where('foo', value)` doesn't crash.
 *
 * The database object is mocked separately via test/mocks/database.ts; tests
 * that exercise list rendering should override `database.collections.get(...)`
 * inline to return seeded fixtures.
 */

const tag = (kind: string) => (...args: any[]) => ({ kind, args });

export const Q = {
    where: tag('where'),
    oneOf: tag('oneOf'),
    notEq: tag('notEq'),
    eq: tag('eq'),
    gt: tag('gt'),
    lt: tag('lt'),
    gte: tag('gte'),
    lte: tag('lte'),
    and: tag('and'),
    or: tag('or'),
    on: tag('on'),
    sortBy: tag('sortBy'),
    take: tag('take'),
    skip: tag('skip'),
};

// Some files import from the package root for decorators / model classes;
// keep these as light no-op factories so imports don't blow up.
export class Model {}
export class Database {}

// `field`, `date`, `text`, etc. decorators — return a no-op decorator factory.
const decorator = () => () => undefined as any;
export const field = decorator();
export const date = decorator();
export const text = decorator();
export const json = decorator();
export const readonly = decorator();
export const immutableRelation = decorator();
export const relation = decorator();
export const children = decorator();
export const action = decorator();
export const lazy = decorator();

export default { Q, Model, Database };
