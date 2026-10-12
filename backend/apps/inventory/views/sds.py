from drf_spectacular.utils import extend_schema
from rest_framework import mixins
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.users.models import User
from apps.users.permissions import role_at_least

from ..filters import SDSFilter
from ..models import SDS
from ..schema import ERROR_DETAIL
from ..serializers import (
    SDSCorrectionSerializer,
    SDSReplaceSerializer,
    SDSSerializer,
    SDSWriteSerializer,
)


# List/retrieve are fully public (no login, no CSRF) — SDS documents are
# public safety information, matching the "fully public SDS viewing"
# decision from the roles roadmap. Writes need Stockroom: create (attach a
# document, or a newer revision, to a container) and the two corrections,
# partial_update (fix a document's details or file, for every container
# sharing it) and replace (this container had the wrong SDS). There's no
# delete: a document no row uses any more is trashed on Drive instead.
class SDSView(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, GenericViewSet
):
    queryset = SDS.objects.select_related("container", "container__chemical")
    filterset_class = SDSFilter
    permission_classes = [AllowAny]
    # No authentication_classes override here (unlike RegisterView, which
    # this was first modeled on) — that view only ever has one, genuinely
    # public action. This one also has `create`, which needs to see who's
    # actually logged in; class-level authentication_classes = [] would
    # leave request.user as AnonymousUser for every action, including
    # create, so role_at_least would reject every request regardless of
    # the real user's role. AllowAny on list/retrieve already makes those
    # work with or without a session, so the default authenticators are
    # safe to leave in place here.

    WRITE_ACTIONS = {"create", "partial_update", "replace"}

    def get_permissions(self):
        if self.action in self.WRITE_ACTIONS:
            return [role_at_least(User.Role.STOCKROOM)()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "create":
            return SDSWriteSerializer
        return SDSSerializer

    # PATCH only (there's no `update`, so PUT is refused): "fix this
    # document", see SDSCorrectionSerializer. Answers with the full SDS.
    @extend_schema(
        request=SDSCorrectionSerializer,
        responses={200: SDSSerializer, 400: ERROR_DETAIL},
    )
    def partial_update(self, request, *args, **kwargs):
        sds = self.get_object()
        serializer = SDSCorrectionSerializer(sds, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SDSSerializer(sds).data)

    # "Wrong SDS on this container": see SDSReplaceSerializer
    @extend_schema(
        request=SDSReplaceSerializer,
        responses={200: SDSSerializer, 400: ERROR_DETAIL},
    )
    @action(detail=True, methods=["post"])
    def replace(self, request, pk=None):
        sds = self.get_object()
        serializer = SDSReplaceSerializer(sds, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SDSSerializer(sds).data)
