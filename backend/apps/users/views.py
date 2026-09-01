from django.contrib.auth import authenticate, login, logout, get_user_model
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status, serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, inline_serializer, OpenApiParameter
from drf_spectacular.types import OpenApiTypes
from .models import User
from .serializers import UserSerializer, NewUserSerializer


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(APIView):
    """GET once on app load so Django sets the csrftoken cookie."""

    permission_classes = [AllowAny]

    @extend_schema(
        request=None,
        responses={
            200: inline_serializer(
                name="SuccessMessage", fields={"detail": serializers.CharField()}
            )
        },
    )
    def get(self, request):
        return Response({"detail": "CSRF cookie set"})


class LoginView(APIView):
    """Session login. Expects {username, password}; returns the user."""

    permission_classes = [AllowAny]

    @extend_schema(
        request=None,
        responses={
            200: UserSerializer,
            401: inline_serializer(
                name="InvalidRequest", fields={"detail": serializers.CharField()}
            ),
        },
    )
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

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Returns the currently authenticated user."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class RegisterView(APIView):
    """Registers a new user."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=NewUserSerializer, responses={201: UserSerializer})
    def post(self, request):
        """Handles the creation of a new user for authentication

        Method arguments:
        request -- The full HTTP request object
        """

        req_body = request.data
        serializer = NewUserSerializer(data=req_body)
        serializer.is_valid(raise_exception=True)
        # TODO: Implement actual role determination logic
        # role/user_type must be the TextChoices *value* ("lab_manager"), not
        # the display label ("Lab Manager") — the two differ, and permission
        # checks like IsManager compare against the value.
        new_user = serializer.save(role=User.Role.LAB_MANAGER, user_type=User.UserType.FULL)

        return Response(UserSerializer(new_user).data, status=status.HTTP_201_CREATED)


class ValidateView(APIView):
    """Validates username availability and checks if account for email exists already"""

    permission_classes = [AllowAny]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="email",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Check for existing account",
            ),
            OpenApiParameter(
                name="username",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Check for username availability",
            ),
        ],
        request=None,
        responses={
            204: None,
            422: inline_serializer(name="UserTaken", fields={"errors": OpenApiTypes.OBJECT}),
        },
    )
    def get(self, request):
        User = get_user_model()

        email = request.query_params.get("email", None)
        username = request.query_params.get("username", None)

        new_account = True
        username_available = True

        if username is not None:
            try:
                user = User.objects.get(username=username)
                if user:
                    username_available = False
            except User.DoesNotExist:
                pass

        if email is not None:
            try:
                user = User.objects.get(email=email)
                if user:
                    new_account = False
            except User.DoesNotExist:
                pass

        if not new_account or not username_available:
            return Response(
                {
                    "errors": {
                        **(
                            {"email": "An account for this email already exists"}
                            if not new_account
                            else {}
                        ),
                        **(
                            {"username": "This username is unavailable"}
                            if not username_available
                            else {}
                        ),
                    }
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)
