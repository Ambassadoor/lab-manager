from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CsrfView, LoginView, LogoutView, MeView, RegisterView, UserView, ValidateView

router = DefaultRouter()
router.register(r"users", UserView, basename="user")

urlpatterns = [
    path("csrf/", CsrfView.as_view(), name="csrf"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("register/", RegisterView.as_view(), name="register"),
    path("validate/", ValidateView.as_view(), name="validate"),
] + router.urls
