from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ContainerView, ChemicalView, LocationView

router = DefaultRouter()

router.register(r'containers', ContainerView, basename="container")
router.register(r'chemicals', ChemicalView, basename="chemical")
router.register(r'locations', LocationView, basename="location")

urlpatterns = [
    path("", include(router.urls)),
]