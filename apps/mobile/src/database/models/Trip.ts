import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class Trip extends Model {
    static table = 'trips';

    @field('trip_id') tripId!: string;
    @field('route') route!: string;
    @field('status') status!: string;
    @field('driver_id') driverId!: string;
    @field('vehicle_id') vehicleId!: string;

    @readonly @date('created_at') createdAt!: Date;
    @readonly @date('updated_at') updatedAt!: Date;
}
