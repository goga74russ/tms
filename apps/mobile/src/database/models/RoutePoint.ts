import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class RoutePoint extends Model {
    static table = 'route_points';

    @field('route_point_id') routePointId!: string;
    @field('trip_id') tripId!: string;
    @field('address') address!: string;
    @field('type') type!: string;
    @field('status') status!: string;
    @date('window_start') windowStart?: Date;
    @date('window_end') windowEnd?: Date;

    @readonly @date('created_at') createdAt!: Date;
    @readonly @date('updated_at') updatedAt!: Date;
}
