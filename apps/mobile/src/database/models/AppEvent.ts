import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class AppEvent extends Model {
    static table = 'events';

    @field('event_id') eventId!: string;
    @field('type') type!: string;
    @field('entity_id') entityId!: string;
    @field('entity_type') entityType!: string;
    @field('payload') payload!: string;
    @date('timestamp') timestamp!: Date;
    @field('synced') synced!: boolean;

    @readonly @date('created_at') createdAt!: Date;
    @readonly @date('updated_at') updatedAt!: Date;
}
