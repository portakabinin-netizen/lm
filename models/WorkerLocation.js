const mongoose = require('mongoose');

/**
 * WorkerLocation Schema
 * Stores high-frequency real-time worker coordinates with 2dsphere spatial index.
 * Coordinates are stored in GeoJSON format: [Longitude, Latitude]
 */
const LocationSchema = new mongoose.Schema(
  {
    workerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [Longitude, Latitude]
        required: true,
      },
    },
    batteryLevel: {
      type: Number,
      default: null,
    },
    speed: {
      type: Number,
      default: null,
    },
    heading: {
      type: Number,
      default: null,
    },
    accuracy: {
      type: Number,
      default: null,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'WorkerLocations',
  }
);

// 2dsphere spatial index on GeoJSON location field for high-speed spatial queries
LocationSchema.index({ location: '2dsphere' });

/**
 * Find workers within a specified radius (in meters) of a point using $near
 * @param {number} longitude - Center longitude
 * @param {number} latitude - Center latitude
 * @param {number} maxDistanceMeters - Maximum search distance in meters
 * @param {number} [limit=50] - Max records to return
 */
LocationSchema.statics.findNear = function (longitude, latitude, maxDistanceMeters = 500, limit = 50) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [Number(longitude), Number(latitude)],
        },
        $maxDistance: maxDistanceMeters,
      },
    },
  }).limit(limit);
};

/**
 * Check if a specific worker is inside a circular geofence using $geoWithin and $centerSphere
 * @param {string} workerId - Unique worker identifier
 * @param {number} centerLng - Geofence center longitude
 * @param {number} centerLat - Geofence center latitude
 * @param {number} radiusMeters - Geofence radius in meters
 */
LocationSchema.statics.isWorkerInsideCircle = async function (workerId, centerLng, centerLat, radiusMeters) {
  const EARTH_RADIUS_METERS = 6378100;
  const radiusInRadians = radiusMeters / EARTH_RADIUS_METERS;

  const match = await this.findOne({
    workerId: String(workerId),
    location: {
      $geoWithin: {
        $centerSphere: [[Number(centerLng), Number(centerLat)], radiusInRadians],
      },
    },
  }).lean();

  return !!match;
};

/**
 * Find all workers inside a polygon geofence using $geoWithin
 * @param {Array<Array<number>>} polygonCoordinates - Array of [lng, lat] vertices forming closed polygon (first == last)
 */
LocationSchema.statics.findWorkersInPolygon = function (polygonCoordinates) {
  return this.find({
    location: {
      $geoWithin: {
        $geometry: {
          type: 'Polygon',
          coordinates: [polygonCoordinates],
        },
      },
    },
  });
};

const WorkerLocation =
  mongoose.models.WorkerLocation || mongoose.model('WorkerLocation', LocationSchema);

module.exports = WorkerLocation;
