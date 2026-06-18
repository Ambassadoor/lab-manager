import json
import os
import time
import requests
from decimal import Decimal
from django.core.management.base import BaseCommand
from apps.inventory.models import Container, Chemical, Location, ChemicalStorageCategories, Ingredient, WeightReading
from django.db.utils import DataError, IntegrityError
from django.contrib.auth import get_user_model

NOTION_SECRET = os.environ.get("NOTION_SECRET")
DB_ID = os.environ.get("NOTION_DB_ID")

class Command(BaseCommand):
    def handle(self, *arkgs, **options):
        #Get Notion DB Items
        start_cursor = ""
        results = []
        while start_cursor is not None:
            r = requests.post(
                f'https://api.notion.com/v1/data_sources/{DB_ID}/query',
                headers={
                    "Notion-Version": "2026-03-11",
                    "Content-Type": "application/json",
                    "Authorization": NOTION_SECRET
                },
                json={"start_cursor": start_cursor}).json()
            if r["has_more"]:
                start_cursor=r["next_cursor"]
            else:
                start_cursor=None
            results.extend(r["results"])
            time.sleep(0.3)
            #For each item
        for row in results:
            try:
                ingredients=None
                props = row["properties"]
                id = props["ID"]["unique_id"]["number"]
                try:
                    Container.objects.get(pk=id)
                    continue
                except Container.DoesNotExist:
                    breakpoint()
                last_edited = str(row["last_edited_time"]).split("T")[0]
                cas = str(props["CAS"]["rich_text"][0]["plain_text"]).split(",")
                cas = [s.strip() for s in cas]
                    #if len(item.cas) == 1
                if len(cas) == 1:
                    try:
                        chem = Chemical.objects.get(cas=cas[0])
                    except Chemical.DoesNotExist:
                        chem = Chemical.objects.create(
                            name=props["Name"]["title"][0]["plain_text"],
                            cas=cas[0]
                        )
                else:
                    chem, created = Chemical.objects.get_or_create(
                        name=props["Name"]["title"][0]["plain_text"]
                    )
                    ingredients = cas
                
                storage_category = props["Group #"]["select"]["name"]
                chem_cat = ChemicalStorageCategories.objects.get(shorthand=storage_category)
                chem.storage_category=chem_cat
                chem.save()
                location = props["Storage Location"]["select"]["name"]
                location_map = {
                    "406": 4,
                    "404 Fire Cabinet": 13,
                    "415A": 6,
                    "415 Fire Cabinet": 7,
                    "415 Gray Fridge - Freezer": 15,
                    "404 Side Room Cabinets": 18,
                    "415A Acid Cabinet": 19,
                    "415 Fridge": 14,
                }
                c_location = Location.objects.get(pk=location_map[location])
                discarded = props["Status"]["status"]["name"] == "Discarded"
                if discarded:
                    d_date=last_edited
                else:
                    d_date=None
                dr_val = props["Date Received"]["date"]
                do_val = props["Date Opened"]["date"]
                iw = props["Initial Weight (g)"]["number"]
                tw = props["Container Weight"]["formula"]["number"]
                m = props["Company"]["rich_text"]
                pn = props["Product #"]["rich_text"]
                q = props["Unit of Measurement"]["select"]
                container = Container.objects.create(
                    pk=props["ID"]["unique_id"]["number"],
                    name=props["Name"]["title"][0]["plain_text"],
                    chemical=chem,
                    location=c_location,
                    manufacturer=m[0]["plain_text"] if m else None,
                    initial_quantity=props["Max Volume/Mass"]["number"] or None,
                    quantity_unit=q["name"] if q else None,
                    product_num=pn[0]["plain_text"] if pn else None,
                    date_received=dr_val["start"] if dr_val else None,
                    date_opened=do_val["start"] if do_val else None,
                    date_discarded=d_date,
                    density=props["Density/Specific Gravity (g/mL)"]["number"] or None,
                    initial_weight=Decimal(iw) if iw is not None else None,
                    tare_weight = Decimal(tw) if tw is not None else None
                )
                if ingredients is not None:
                    for i in ingredients:
                        c, created = Chemical.objects.get_or_create(cas=i)
                        if created:
                            c.name="TODO"
                            c.save()
                        Ingredient.objects.create(chemical=c, container=container)
                if props["Current Weight"]["number"]:
                    WeightReading.objects.create(
                        container=container,
                        weight=props["Current Weight"]["number"],
                        recorded_by=get_user_model().objects.get(pk=1)
                    )
            except KeyError:
                print("Key error on:")
                print(props["ID"]["unique_id"]["number"])
                continue
            except TypeError as e:
                print("Type error")
                print(e)
                print(row["properties"]["ID"])
                continue
            except Chemical.DoesNotExist as c:
                print(props["ID"]["unique_id"]["number"])
                print(chem)
                print(c)
                continue
            except ChemicalStorageCategories.DoesNotExist as d:
                print(props["ID"]["unique_id"]["number"])
                print(chem)
                print(storage_category)
                print(d)