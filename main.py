import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"

DATA_DIR.mkdir(exist_ok=True)
STATIC_DIR.mkdir(exist_ok=True)

RECIPES_FILE = DATA_DIR / "recipes.json"
PLAN_FILE = DATA_DIR / "plan.json"
WEIGHT_FILE = DATA_DIR / "weight.json"
ACTIVITIES_FILE = DATA_DIR / "activities.json"

app = FastAPI(title="Metabolic Meal Planner - Anti-Insulino-Resistenza", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_json(filepath: Path, default_data: Any) -> Any:
    if not filepath.exists():
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(default_data, f, indent=2, ensure_ascii=False)
        return default_data
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(filepath: Path, data: Any):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# Pydantic models
class Ingredient(BaseModel):
    name: str
    quantity: float
    unit: str
    category: str


class MealPrepInfo(BaseModel):
    is_prep: bool = True
    prep_day: str = "Domenica"
    batch_title: str
    instructions: str
    can_freeze: bool = True


class Recipe(BaseModel):
    id: Optional[str] = None
    title: str
    category: str  # colazione, spuntino, pranzo, cena
    allowed_slots: List[str] = ["pranzo", "cena"]
    servings: int = 2
    prep_time_minutes: int = 5
    ingredients: List[Ingredient]
    meal_prep: Optional[MealPrepInfo] = None
    notes: Optional[str] = ""


class SlotUpdate(BaseModel):
    week_number: int
    day_index: int
    slot_name: str  # colazione, merenda_mattina, pranzo, merenda_pomeriggio, cena
    recipe_id: Optional[str] = None


class CopyWeekRequest(BaseModel):
    source_week: int = 1
    target_week: int = 2


class WeightEntry(BaseModel):
    id: Optional[str] = None
    date: str  # YYYY-MM-DD
    weight: float
    body_fat: Optional[float] = None
    muscle: Optional[float] = None
    visceral_fat: Optional[float] = None
    water: Optional[float] = None
    waist: Optional[float] = None
    hips: Optional[float] = None
    notes: Optional[str] = ""


class ActivityEntry(BaseModel):
    id: Optional[str] = None
    date: str  # YYYY-MM-DD or YYYY-MM-DDTHH:MM
    activity_type: str = "walking_pad"  # walking_pad, outdoor_walking, cyclette
    description: str = ""
    duration_minutes: float
    distance_km: Optional[float] = None
    speed_kmh: Optional[float] = 4.0
    calories: Optional[float] = 0.0
    auto_calories: bool = True
    notes: Optional[str] = ""


# API Endpoints
@app.get("/api/recipes")
def get_recipes():
    return load_json(RECIPES_FILE, [])


@app.post("/api/recipes")
def create_recipe(recipe: Recipe):
    recipes = load_json(RECIPES_FILE, [])
    if not recipe.id:
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", recipe.title.lower()).strip("-")
        recipe.id = f"{slug}-{len(recipes) + 1}"
    
    # check if id exists
    for r in recipes:
        if r.get("id") == recipe.id:
            raise HTTPException(status_code=400, detail="Ricetta con questo ID già esistente.")

    recipe_dict = recipe.model_dump()
    recipes.append(recipe_dict)
    save_json(RECIPES_FILE, recipes)
    return recipe_dict


@app.put("/api/recipes/{recipe_id}")
def update_recipe(recipe_id: str, updated: Recipe):
    recipes = load_json(RECIPES_FILE, [])
    found = False
    for i, r in enumerate(recipes):
        if r.get("id") == recipe_id:
            updated.id = recipe_id
            recipes[i] = updated.model_dump()
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Ricetta non trovata.")
    save_json(RECIPES_FILE, recipes)
    return updated.model_dump()


@app.delete("/api/recipes/{recipe_id}")
def delete_recipe(recipe_id: str):
    recipes = load_json(RECIPES_FILE, [])
    new_recipes = [r for r in recipes if r.get("id") != recipe_id]
    if len(new_recipes) == len(recipes):
        raise HTTPException(status_code=404, detail="Ricetta non trovata.")
    save_json(RECIPES_FILE, new_recipes)
    return {"status": "success", "deleted_id": recipe_id}


@app.get("/api/plan")
def get_plan():
    return load_json(PLAN_FILE, {"weeks": []})


@app.post("/api/plan")
def save_plan(plan_data: Dict[str, Any]):
    save_json(PLAN_FILE, plan_data)
    return {"status": "success"}


@app.put("/api/plan/slot")
def update_slot(update: SlotUpdate):
    plan = load_json(PLAN_FILE, {"weeks": []})
    for week in plan.get("weeks", []):
        if week.get("week_number") == update.week_number:
            for day in week.get("days", []):
                if day.get("day_index") == update.day_index:
                    if "slots" not in day:
                        day["slots"] = {}
                    day["slots"][update.slot_name] = update.recipe_id
                    save_json(PLAN_FILE, plan)
                    return {"status": "success", "day": day}
    raise HTTPException(status_code=404, detail="Giorno o settimana non trovati.")


@app.post("/api/plan/copy-week")
def copy_week(req: CopyWeekRequest):
    plan = load_json(PLAN_FILE, {"weeks": []})
    source = None
    target_idx = None
    for i, w in enumerate(plan.get("weeks", [])):
        if w.get("week_number") == req.source_week:
            source = w
        if w.get("week_number") == req.target_week:
            target_idx = i
            
    if not source or target_idx is None:
        raise HTTPException(status_code=404, detail="Settimana sorgente o destinazione non trovata.")

    # clone days with updated day_index
    offset = 7 if req.target_week == 2 else 0
    copied_days = []
    for d in source.get("days", []):
        new_d = json.loads(json.dumps(d))
        new_d["day_index"] = (new_d.get("day_index", 0) % 7) + offset
        copied_days.append(new_d)

    plan["weeks"][target_idx]["days"] = copied_days
    save_json(PLAN_FILE, plan)
    return {"status": "success", "target_week": plan["weeks"][target_idx]}


@app.get("/api/shopping-list")
def get_shopping_list(week: Optional[str] = "1"):
    recipes = {r["id"]: r for r in load_json(RECIPES_FILE, [])}
    plan = load_json(PLAN_FILE, {"weeks": []})

    aggregated: Dict[str, Dict[str, Any]] = {}
    slot_names = ["colazione", "merenda_mattina", "pranzo", "merenda_pomeriggio", "cena"]

    target_weeks = []
    for w in plan.get("weeks", []):
        w_num = str(w.get("week_number", 1))
        if week in ["both", "all", "14"]:
            target_weeks.append(w)
        elif week == w_num:
            target_weeks.append(w)

    if not target_weeks and plan.get("weeks"):
        target_weeks = [plan["weeks"][0]]

    for week_obj in target_weeks:
        for day in week_obj.get("days", []):
            slots = day.get("slots", {})
            for slot_key in slot_names:
                recipe_id = slots.get(slot_key)
                if recipe_id and recipe_id in recipes:
                    recipe = recipes[recipe_id]
                    for ing in recipe.get("ingredients", []):
                        name = ing.get("name", "").strip()
                        qty = float(ing.get("quantity", 1))
                        unit = ing.get("unit", "").strip()
                        category = ing.get("category", "Altro").strip()
                        if "senza lattosio" in category.lower():
                            category = "Banco Frigo & Latticini"

                        agg_key = f"{category}___{name.lower()}___{unit.lower()}"
                        if agg_key not in aggregated:
                            aggregated[agg_key] = {
                                "name": name,
                                "quantity": 0.0,
                                "unit": unit,
                                "category": category,
                                "occurrences": 0,
                                "recipes": set()
                            }
                        aggregated[agg_key]["quantity"] += qty
                        aggregated[agg_key]["occurrences"] += 1
                        aggregated[agg_key]["recipes"].add(recipe["title"])

    # Organize by category
    categories_order = [
        "Ortofrutta",
        "Macellaio sotto casa",
        "Banco Frigo & Latticini",
        "Surgelati",
        "Dispensa, Scatolame & Secco",
        "Pizzeria / Forno",
        "Altro"
    ]

    grouped: Dict[str, List[Dict[str, Any]]] = {c: [] for c in categories_order}

    for item in aggregated.values():
        item_copy = {
            "name": item["name"],
            "quantity": round(item["quantity"], 1) if item["quantity"] % 1 != 0 else int(item["quantity"]),
            "unit": item["unit"],
            "category": item["category"],
            "occurrences": item["occurrences"],
            "recipes": list(item["recipes"])
        }
        cat = item["category"]
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(item_copy)

    # Sort items within each category
    for cat in grouped:
        grouped[cat].sort(key=lambda x: x["name"])

    # Filter out empty categories
    result = {k: v for k, v in grouped.items() if v}
    return result


@app.get("/api/meal-prep")
def get_meal_prep():
    recipes = {r["id"]: r for r in load_json(RECIPES_FILE, [])}
    plan = load_json(PLAN_FILE, {"weeks": []})

    prep_tasks_w1: Dict[str, Dict[str, Any]] = {}
    prep_tasks_w2: Dict[str, Dict[str, Any]] = {}

    slot_names = ["colazione", "merenda_mattina", "pranzo", "merenda_pomeriggio", "cena"]

    for week in plan.get("weeks", []):
        w_num = week.get("week_number", 1)
        target_dict = prep_tasks_w1 if w_num == 1 else prep_tasks_w2

        for day in week.get("days", []):
            day_name = day.get("day_name", "")
            slots = day.get("slots", {})
            for slot_key in slot_names:
                r_id = slots.get(slot_key)
                if r_id and r_id in recipes:
                    recipe = recipes[r_id]
                    mp = recipe.get("meal_prep")
                    if mp and mp.get("is_prep"):
                        batch_title = mp.get("batch_title", recipe["title"])
                        if batch_title not in target_dict:
                            target_dict[batch_title] = {
                                "batch_title": batch_title,
                                "prep_day": mp.get("prep_day", "Domenica"),
                                "instructions": mp.get("instructions", ""),
                                "can_freeze": mp.get("can_freeze", True),
                                "needed_for": []
                            }
                        target_dict[batch_title]["needed_for"].append(f"{day_name} ({slot_key.replace('_', ' ').capitalize()})")

    return {
        "week1_prep": list(prep_tasks_w1.values()),
        "week2_prep": list(prep_tasks_w2.values())
    }


# WEIGHT TRACKING ENDPOINTS
@app.get("/api/weight")
def get_weights():
    weights = load_json(WEIGHT_FILE, [])
    weights.sort(key=lambda x: x.get("date", ""))
    return weights


@app.post("/api/weight")
def add_weight(entry: WeightEntry):
    weights = load_json(WEIGHT_FILE, [])
    if not entry.id:
        import time
        entry.id = f"w_{int(time.time() * 1000)}"
    entry_dict = entry.model_dump()
    weights.append(entry_dict)
    weights.sort(key=lambda x: x.get("date", ""))
    save_json(WEIGHT_FILE, weights)
    return entry_dict


@app.delete("/api/weight/{entry_id}")
def delete_weight(entry_id: str):
    weights = load_json(WEIGHT_FILE, [])
    new_weights = [w for w in weights if w.get("id") != entry_id]
    if len(new_weights) == len(weights):
        raise HTTPException(status_code=404, detail="Misurazione non trovata.")
    save_json(WEIGHT_FILE, new_weights)
    return {"status": "success", "deleted_id": entry_id}


# ACTIVITIES TRACKING ENDPOINTS
@app.get("/api/activities")
def get_activities():
    activities = load_json(ACTIVITIES_FILE, [])
    activities.sort(key=lambda x: x.get("date", ""), reverse=True)
    return activities


@app.post("/api/activities")
def add_activity(entry: ActivityEntry):
    activities = load_json(ACTIVITIES_FILE, [])
    if not entry.id:
        import time
        entry.id = f"act_{int(time.time() * 1000)}"
    entry_dict = entry.model_dump()
    activities.append(entry_dict)
    activities.sort(key=lambda x: x.get("date", ""), reverse=True)
    save_json(ACTIVITIES_FILE, activities)
    return entry_dict


@app.delete("/api/activities/{entry_id}")
def delete_activity(entry_id: str):
    activities = load_json(ACTIVITIES_FILE, [])
    new_acts = [a for a in activities if a.get("id") != entry_id]
    if len(new_acts) == len(activities):
        raise HTTPException(status_code=404, detail="Attività non trovata.")
    save_json(ACTIVITIES_FILE, new_acts)
    return {"status": "success", "deleted_id": entry_id}


# Static Files and Root
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def serve_index():
    return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 9999))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
