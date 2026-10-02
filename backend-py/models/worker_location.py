"""
🧱 WorkerLocation Model
Python/Motor equivalent of models/WorkerLocation.js
Stores high-frequency real-time worker coordinates with 2dsphere spatial index.
"""

from motor.motor_asyncio import AsyncIOMotorDatabase


def get_worker_location_model(db: AsyncIOMotorDatabase):
    """Return the WorkerLocations Motor collection with helper statics."""

    collection = db["WorkerLocations"]

    class WorkerLocationModel:
        """
        Wraps the Motor collection with the same static methods as the
        Mongoose model (findNear, isWorkerInsideCircle, findWorkersInPolygon).
        """
        col = collection

        @classmethod
        async def find_one(cls, query: dict, **kwargs):
            return await cls.col.find_one(query, **kwargs)

        @classmethod
        async def find_one_and_update(cls, filter_: dict, update: dict, **kwargs):
            from pymongo import ReturnDocument
            upsert = kwargs.get("upsert", False)
            return_document = ReturnDocument.AFTER if kwargs.get("return_document", True) else ReturnDocument.BEFORE
            return await cls.col.find_one_and_update(
                filter_, update, upsert=upsert, return_document=return_document
            )

        @classmethod
        async def find_near(cls, longitude: float, latitude: float,
                            max_distance_meters: float = 500, limit: int = 50):
            """Workers within max_distance_meters of (longitude, latitude)."""
            cursor = cls.col.find({
                "location": {
                    "$near": {
                        "$geometry": {
                            "type": "Point",
                            "coordinates": [float(longitude), float(latitude)],
                        },
                        "$maxDistance": max_distance_meters,
                    }
                }
            }).limit(limit)
            return await cursor.to_list(length=limit)

        @classmethod
        async def is_worker_inside_circle(cls, worker_id: str,
                                          center_lng: float, center_lat: float,
                                          radius_meters: float) -> bool:
            """True if worker is inside the circular geofence."""
            EARTH_RADIUS = 6_378_100
            radius_radians = radius_meters / EARTH_RADIUS
            match = await cls.col.find_one({
                "workerId": str(worker_id),
                "location": {
                    "$geoWithin": {
                        "$centerSphere": [
                            [float(center_lng), float(center_lat)],
                            radius_radians,
                        ]
                    }
                }
            })
            return match is not None

        @classmethod
        async def find_workers_in_polygon(cls, polygon_coordinates: list):
            """Workers inside a polygon geofence."""
            cursor = cls.col.find({
                "location": {
                    "$geoWithin": {
                        "$geometry": {
                            "type": "Polygon",
                            "coordinates": [polygon_coordinates],
                        }
                    }
                }
            })
            return await cursor.to_list(length=None)

        @classmethod
        async def ensure_indexes(cls):
            """Create 2dsphere index (idempotent)."""
            await cls.col.create_index([("location", "2dsphere")])
            await cls.col.create_index([("workerId", 1)], unique=True)

    return WorkerLocationModel
