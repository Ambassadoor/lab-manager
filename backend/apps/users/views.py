from django.contrib.auth import authenticate, login, logout, get_user_model
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import mixins, status, serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet
from drf_spectacular.utils import extend_schema, inline_serializer, OpenApiParameter
from drf_spectacular.types import OpenApiTypes
from .models import User
from .permissions import role_at_least
from .serializers import UserSerializer, UserAdminSerializer, NewUserSerializer


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
    """Returns or updates the currently authenticated user's own profile."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    # Self-service profile edits — role stays read_only on UserSerializer,
    # so this can't be used to self-promote regardless of what's posted.
    @extend_schema(request=UserSerializer, responses={200: UserSerializer})
    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class UserView(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, GenericViewSet
):
    """Admin/Lab Manager viewing and editing *other* users' accounts.

    List/retrieve/update only — no create (registration already covers
    that) and no destroy (account deactivation/deletion isn't in scope
    yet). Every action shares the same LAB_MANAGER+ gate: unlike the
    inventory views, there's no read/write split here — viewing another
    user's info is itself the restricted thing, not just editing it.
    """

    queryset = User.objects.all().order_by("username")
    serializer_class = UserAdminSerializer
    permission_classes = [role_at_least(User.Role.LAB_MANAGER)]
    search_fields = ["username", "first_name", "last_name", "email"]
    filterset_fields = ["role"]
    ordering_fields = ["username", "first_name", "last_name", "role"]


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
        # checks like role_at_least compare against the value.
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

        username_available = username is None or not User.objects.filter(username=username).exists()
        new_account = email is None or not User.objects.filter(email=email).exists()

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
