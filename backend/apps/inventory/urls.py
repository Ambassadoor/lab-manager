from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ContainerView,
    ChemicalView,
    LocationView,
    LocationTypeView,
    ChemicalStorageCategoryView,
    WeightReadingView,
)

router = DefaultRouter()

router.register(r"containers", ContainerView, basename="container")
router.register(r"chemicals", ChemicalView, basename="chemical")
router.register(r"locations", LocationView, basename="location")
router.register(
    r"chemical_storage_categories",
    ChemicalStorageCategoryView,
    basename="chemical_storage_category",
)
router.register(r"weight_readings", WeightReadingView, basename="weight_reading")
router.register(r"location_types", LocationTypeView, basename="location_type")
urlpatterns = [
    path("", include(router.urls)),
]
