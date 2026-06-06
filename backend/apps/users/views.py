from django.contrib.auth import authenticate, login, logout, get_user_model
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import UserSerializer


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(APIView):
    """GET once on app load so Django sets the csrftoken cookie."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"detail": "CSRF cookie set"})


class LoginView(APIView):
    """Session login. Expects {username, password}; returns the user."""

    permission_classes = [AllowAny]

    def post(self, request):
        user = authenticate(
            request,
            username=request.data.get("username"),
            password=request.data.get("password"),
        )
        if user is None:
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    """Ends the current session."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Returns the currently authenticated user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class RegisterView(APIView):
    """Registers a new user."""

    permission_classes = [AllowAny]

    @csrf_exempt
    def post(self, request):
        """Handles the creation of a new user for authentication

        Method arguments:
        request -- The full HTTP request object
        """
        User = get_user_model()

        req_body = request.data

        # Create a new user by invoking the `create_user` helper method
        # on Django's built-in User model
        new_user = User.objects.create_user(
            username=req_body.get("username"),
            email=req_body.get("email"),
            password=req_body.get("password"),
            first_name=req_body.get("first_name"),
            last_name=req_body.get("last_name"),
            role=req_body.get("role"),
            user_type=req_body.get("user_type"),
            scanned_id=req_body.get("scanned_id"),
        )

        return Response(UserSerializer(new_user).data, status=status.HTTP_201_CREATED)
