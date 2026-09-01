from django.db import transaction
from django.db.models.functions import Lower
from django.http import Http404
from rest_framework import filters, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from ..models import Chemical, ChemicalStorageCategories, CheckoutEvent, Container, WeightReading
from ..permissions import IsManager
from ..serializers import (
    ChemicalSerializer,
    CheckoutEventSerializer,
    CheckoutEventWriteSerializer,
    ContainerSerializer,
    ContainerWriteSerializer,
    IngredientSerializer,
    WeightReadingReadSerializer,
    WeightReadingSerializer,
)


class ContainerView(ModelViewSet):
    queryset = Container.objects.all()
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["id"]
    ordering = ["id"]
    lookup_field = "slug"

    permission_classes = [IsAuthenticated]

    # Only managers can delete
    def get_permissions(self):
        if self.action in ["destroy"]:
            return [permission() for permission in [IsManager]]
        return super().get_permissions()

    # Determine which serialize to use
    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update", "metadata"]:
            return ContainerWriteSerializer
        elif self.action in ["check_out", "check_in"]:
            return CheckoutEventSerializer
        else:
            return ContainerSerializer

    # Validates if a container has been discarded
    @action(detail=True, methods=["get"])
    def is_discarded(self, request, slug=None):
        try:
            q = self.get_object()
            return Response(
                {"is_discarded": q.date_discarded is not None}, status=status.HTTP_200_OK
            )
        except Http404:
            return Response({"is_valid": False}, status=status.HTTP_200_OK)

    # Creates checkout events for the provided containers
    @action(detail=False, methods=["POST"])
    def check_out(self, request):
        data = request.data

        events = []
        for slug in data:
            try:
                container = Container.objects.get(slug=slug)
                events.append({"container": container.id, "action": "out"})
            except Container.DoesNotExist:
                return Response(status=status.HTTP_400_BAD_REQUEST)
        serializer = CheckoutEventWriteSerializer(
            data=events, many=True, context={"request": request}
        )
        if serializer.is_valid(raise_exception=True):
            serializer.save()
            return Response({"events": serializer.data}, status=status.HTTP_201_CREATED)

    # Creates check in events for the provided containers
    @action(detail=False, methods=["POST"])
    def check_in(self, request):
        data = request.data

        events = []
        for slug in data:
            try:
                container = Container.objects.get(slug=slug)
                # Adds a relation to the most recent event only if it is a checkout
                # event that hasn't already been checked in (a "related_event" is
                # only ever set on "in" events, so checking it on the "out" event
                # itself is a no-op — we need the reverse `check_in_event` relation).
                last_check_out = (
                    container.events.filter(action="out").order_by("-timestamp").first()
                )
                if (
                    last_check_out is not None
                    and CheckoutEvent.objects.filter(related_event=last_check_out).exists()
                ):
                    last_check_out = None
                events.append(
                    {
                        "container": container.id,
                        "action": "in",
                        "related_event": last_check_out.id if last_check_out is not None else None,
                    }
                )
            except Container.DoesNotExist:
                return Response(status.HTTP_400_BAD_REQUEST)
        serializer = CheckoutEventWriteSerializer(
            data=events, many=True, context={"request": request}
        )
        if serializer.is_valid(raise_exception=True):
            serializer.save()
            return Response({"events": serializer.data}, status=status.HTTP_201_CREATED)

    # Returns if the provided container is valid or not
    @action(detail=True, methods=["GET"])
    def is_valid(self, request, slug=None):
        try:
            self.get_object()
            return Response({"is_valid": True}, status=status.HTTP_200_OK)
        except Http404:
            return Response({"is_valid": False}, status=status.HTTP_200_OK)

    # Creates new Mixture, chemicals, and containers
    @transaction.atomic
    def create(self, request):
        chemicals = Chemical.objects.all()

        data = request.data

        # Creates a new parent chemical if one does not exist already
        if data.get("multiple_cas"):
            if data.get("mixture_id") != "":
                chemical = Chemical.objects.get(pk=data.get("mixture_id"))
            else:
                mixture_data = {
                    "name": data.get("mixture_name"),
                    "molecular_weight": data.get("mixture_molecular_weight"),
                    "storage_category": data.get("mixture_storage_category"),
                }
                chemical_serializer = ChemicalSerializer(data=mixture_data)
                chemical_serializer.is_valid(raise_exception=True)
                chemical = chemical_serializer.save()
            # Gets or creates children chemicals creates ingredients for the parent chemical
            request_chems = data.get("chemicals")
            for chem in request_chems:
                serializer = ChemicalSerializer(data=chem)
                try:
                    c = chemicals.get(cas=chem.get("cas"))
                except Chemical.DoesNotExist:
                    serializer.is_valid(raise_exception=True)
                    c = serializer.save()

                ingredient_data = {"mixture": chemical.id, "ingredient": c.id}

                ingredient = IngredientSerializer(data=ingredient_data)
                ingredient.is_valid(raise_exception=True)
                ingredient.save()

        else:
            # Handles creating a single chemical if only one cas# was provided
            request_chem = data.get("chemicals")[0]
            storage_category_id = request_chem.get("storage_category")
            if storage_category_id:
                request_chem["storage_category"] = ChemicalStorageCategories.objects.filter(
                    pk=storage_category_id
                ).first()
            chemical, created = Chemical.objects.get_or_create(cas=request_chem.get("cas"))
            if created:
                chemical.molecular_weight = request_chem.get("molecular_weight")
                chemical.name = request_chem.get("name")
                chemical.storage_category = request_chem.get("storage_category")
                chemical.save()
        # Creates the new container
        new_container = {
            "name": data.get("name"),
            "chemical": chemical.id,
            "location": data.get("location"),
            "manufacturer": data.get("manufacturer"),
            "initial_quantity": data.get("initial_quantity"),
            "quantity_unit": data.get("quantity_unit"),
            "product_num": data.get("product_num"),
            "date_received": data.get("date_received"),
            "density": data.get("density"),
            "expiration_date": data.get("expiration_date"),
            "initial_weight": data.get("initial_weight"),
            "tare_weight": data.get("tare_weight"),
        }
        serializer = ContainerWriteSerializer(data=new_container)
        serializer.is_valid(raise_exception=True)
        container = serializer.save()
        container.slug = f"chem-{container.id}"
        container.save()
        wr = {
            "container": container.id,
            "weight": container.initial_weight,
        }

        wr_serializer = WeightReadingSerializer(data=wr, context={"request": request})
        wr_serializer.is_valid(raise_exception=True)
        wr_serializer.save()

        # Not resetting IDs on failure: this whole method runs inside
        # @transaction.atomic, so a failed create already rolls back every
        # row it touched. The only thing that survives a rollback is
        # Postgres's auto-increment sequence counter — sequence increments
        # are deliberately non-transactional, to avoid every insert
        # contending on the same lock — so a run of failed creates can leave
        # gaps in the numeric part of Container.label. Resetting the
        # sequence to close that gap would mean mutating shared state
        # outside the transaction, which races against any concurrent
        # insert; the gap is cosmetic and not worth that risk.
        return Response(ContainerSerializer(container).data, status=status.HTTP_201_CREATED)

    # Creates new weigh in event
    @action(detail=True, methods=["GET", "POST"])
    def weigh_in(self, request, slug=None):
        container = self.get_object()

        if request.method == "POST":
            data = request.data

            weigh_in = {
                "container": container.id,
                "weight": data.get("weight"),
            }

            serializer = WeightReadingSerializer(data=weigh_in, context={"request": request})
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        elif request.method == "GET":
            events = container.readings
            serializer = WeightReadingReadSerializer(events, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["PATCH"])
    @transaction.atomic
    def transfer(self, request):
        processed = []
        data = request.data
        # Case-insensitive: barcodes encode Container.label (uppercase,
        # e.g. "CHEM-1161"), but slug is stored lowercase — a raw slug__in
        # match against scanned input would false-negative on every scan.
        slugs = [c["slug"].strip().lower() for c in data["containers"]]
        location = data["location"]
        containers = Container.objects.annotate(slug_lower=Lower("slug")).filter(
            slug_lower__in=slugs
        )
        missing = set(slugs) - {c.slug_lower for c in containers}
        if missing:
            return Response(
                {"detail": f"Container(s) not found: {', '.join(sorted(missing))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for item in containers:
            serializer = ContainerWriteSerializer(
                instance=item, data={"location": location}, partial=True
            )
            serializer.is_valid(raise_exception=True)
            updated = serializer.save()
            processed.append(updated)
        return Response(ContainerSerializer(processed, many=True).data, status=status.HTTP_200_OK)

    # Records a weight reading and checks in a batch of containers in one
    # atomic request — consolidates what used to be two separate actions
    # (weigh_in per container, check_in as a bulk slug list) into the single
    # form flow the frontend's WeighIn page presents.
    @action(detail=False, methods=["POST"], url_path="weigh_in_bulk")
    @transaction.atomic
    def weigh_in_bulk(self, request):
        data = request.data
        checkin = data["checkin"]
        # Case-insensitive: barcodes encode Container.label (uppercase,
        # e.g. "CHEM-1161"), but slug is stored lowercase — a raw slug__in
        # match against scanned input would false-negative on every scan.
        slugs = [c["slug"].strip().lower() for c in checkin]
        weights_by_slug = {c["slug"].strip().lower(): c["weight"] for c in checkin}
        containers = Container.objects.annotate(slug_lower=Lower("slug")).filter(
            slug_lower__in=slugs
        )
        missing = set(slugs) - {c.slug_lower for c in containers}
        if missing:
            return Response(
                {"detail": f"Container(s) not found: {', '.join(sorted(missing))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        readings_data = []
        events_data = []
        for container in containers:
            readings_data.append(
                {"container": container.id, "weight": weights_by_slug[container.slug_lower]}
            )
            # Only attach to the most recent checkout if it hasn't already been
            # checked in (see check_in above for why related_event__exact=None
            # on the "out" event itself is a no-op).
            last_check_out = container.events.filter(action="out").order_by("-timestamp").first()
            if (
                last_check_out is not None
                and CheckoutEvent.objects.filter(related_event=last_check_out).exists()
            ):
                last_check_out = None
            events_data.append(
                {
                    "container": container.id,
                    "action": "in",
                    "related_event": last_check_out.id if last_check_out is not None else None,
                }
            )

        reading_serializer = WeightReadingSerializer(
            data=readings_data, many=True, context={"request": request}
        )
        reading_serializer.is_valid(raise_exception=True)
        reading_serializer.save()

        event_serializer = CheckoutEventWriteSerializer(
            data=events_data, many=True, context={"request": request}
        )
        event_serializer.is_valid(raise_exception=True)
        event_serializer.save()

        return Response(
            {"readings": reading_serializer.data, "events": event_serializer.data},
            status=status.HTTP_201_CREATED,
        )


class WeightReadingView(ModelViewSet):
    queryset = WeightReading.objects.all()
    serializer_class = WeightReadingSerializer

    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["destroy"]:
            return [permission() for permission in [IsManager]]
        return super().get_permissions()
