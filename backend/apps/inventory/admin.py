from django.contrib import admin
from .models import (
    Chemical,
    Container,
    Location,
    ChemicalStorageCategories,
    SDS,
    LocationTypes,
    WeightReading,
    CheckoutEvent,
    Ingredient
)

admin.site.register(Chemical)
admin.site.register(Container)
admin.site.register(Location)
admin.site.register(ChemicalStorageCategories)
admin.site.register(SDS)
admin.site.register(LocationTypes)
admin.site.register(WeightReading)
admin.site.register(CheckoutEvent)
admin.site.register(Ingredient)
