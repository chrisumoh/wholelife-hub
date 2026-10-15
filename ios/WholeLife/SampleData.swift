import SwiftUI

// Local sample data standing in for the web app's localStorage and Supabase sync.
// Food items are text only (CLAUDE.md section 4), West African first (section 3).

struct Meal: Identifiable {
    let id = UUID()
    let slot: String
    let name: String
    let calories: Int
    let detail: String
    var logged: Bool
}

struct Workout: Identifiable {
    let id = UUID()
    let name: String
    let symbol: String
    let minutes: Int
    let calories: Int
    let day: String
}

struct Recipe: Identifiable {
    let id = UUID()
    let name: String
    let origin: String
    let calories: Int
    let minutes: Int
    let summary: String
    let ingredients: [String]
    let steps: [String]
}

struct Achievement: Identifiable {
    let id = UUID()
    let name: String
    let detail: String
    let progress: Double
}

struct Snack: Identifiable {
    let id = UUID()
    let name: String
    let calories: Int
}

enum Sample {
    static let calorieTarget = 2200
    static let waterGoalML = 2700

    static let meals: [Meal] = [
        Meal(slot: "Breakfast", name: "Akara with pap", calories: 380, detail: "Bean fritters with fermented maize pap", logged: true),
        Meal(slot: "Lunch", name: "Jollof rice with chicken", calories: 560, detail: "Smoky tomato rice, grilled chicken, fried plantain", logged: true),
        Meal(slot: "Dinner", name: "Egusi soup with pounded yam", calories: 640, detail: "Melon seed soup with leafy greens and fish", logged: false)
    ]

    static let snacks: [Snack] = [
        Snack(name: "Roasted groundnuts", calories: 170),
        Snack(name: "Boiled plantain", calories: 150),
        Snack(name: "Zobo (no sugar)", calories: 40)
    ]

    static let weeklyCalories: [Double] = [1950, 2100, 1800, 2250, 2050, 1900, 940]
    static let weeklyMinutes: [Double] = [40, 0, 55, 30, 0, 65, 25]
    static let weeklyWater: [Double] = [2200, 2500, 1800, 2700, 2300, 2100, 1400]
    static let weeklySteps: [Double] = [7400, 9100, 6200, 10400, 8300, 5600, 4100]
    static let weeklyWeight: [Double] = [81.4, 81.2, 81.3, 81.0, 80.9, 80.8, 80.7]

    static let workouts: [Workout] = [
        Workout(name: "Brisk walk", symbol: "figure.walk", minutes: 25, calories: 120, day: "Today"),
        Workout(name: "Strength: full body", symbol: "dumbbell.fill", minutes: 40, calories: 260, day: "Yesterday"),
        Workout(name: "Football", symbol: "figure.soccer", minutes: 65, calories: 520, day: "Sunday"),
        Workout(name: "Easy run", symbol: "figure.run", minutes: 30, calories: 300, day: "Friday")
    ]

    static let recipes: [Recipe] = [
        Recipe(name: "Jollof rice with chicken", origin: "Ghana / Nigeria", calories: 560, minutes: 70,
               summary: "Long-grain rice cooked in a smoky tomato, pepper and onion base, served with chicken.",
               ingredients: ["2 cups long-grain parboiled rice", "4 chicken thighs", "4 plum tomatoes", "2 red bell peppers", "1 scotch bonnet pepper", "2 onions", "3 tbsp tomato paste", "3 tbsp vegetable oil", "3 cups chicken stock"],
               steps: ["Season the chicken and bake or grill for 30 to 35 minutes.", "Blend tomatoes, peppers and one onion until smooth.", "Fry the sliced onion, add tomato paste and fry until it darkens.", "Add the blend and cook uncovered until the oil rises.", "Stir in the rice and stock, cover and cook on low heat until tender."]),
        Recipe(name: "Waakye", origin: "Ghana", calories: 520, minutes: 60,
               summary: "Rice and black-eyed peas cooked with dried millet leaves, served with shito and boiled egg.",
               ingredients: ["2 cups rice", "1 cup black-eyed peas", "Dried millet leaves", "2 boiled eggs", "Shito", "Gari"],
               steps: ["Boil the peas with millet leaves until half soft.", "Add the rice and water and cook until tender.", "Serve with shito, egg and gari."]),
        Recipe(name: "Egusi soup", origin: "Nigeria", calories: 640, minutes: 55,
               summary: "Ground melon seed soup with leafy greens, palm oil and smoked fish, eaten with pounded yam.",
               ingredients: ["1 cup ground egusi", "Spinach or bitterleaf", "Palm oil", "Smoked fish", "Onion", "Crayfish", "Stock"],
               steps: ["Heat palm oil and fry the onion.", "Add the egusi paste and stir until it clumps.", "Add stock and fish, simmer 20 minutes.", "Stir in greens and cook 5 more minutes."]),
        Recipe(name: "Moi moi", origin: "Nigeria", calories: 300, minutes: 90,
               summary: "Steamed bean pudding with pepper, onion and egg.",
               ingredients: ["2 cups black-eyed peas", "2 red peppers", "1 onion", "3 tbsp palm oil", "2 boiled eggs"],
               steps: ["Peel the beans and blend with pepper and onion.", "Mix in oil, stock and seasoning.", "Pour into cups or leaves and steam for 45 minutes."])
    ]

    static let achievements: [Achievement] = [
        Achievement(name: "First week logged", detail: "Log meals 7 days in a row", progress: 1.0),
        Achievement(name: "Water champion", detail: "Hit 2,700 mL five days this week", progress: 0.6),
        Achievement(name: "Steady mover", detail: "Work out 4 times in a week", progress: 0.75),
        Achievement(name: "Goal weight", detail: "Reach 78 kg", progress: 0.45)
    ]

    static let coachAdvice = [
        "You have a good base today. Dinner is the main meal left, so keep the egusi portion to about a fist of pounded yam.",
        "Water is behind your usual pace. Add two glasses before dinner.",
        "A 20 minute walk after dinner would close your weekly workout goal."
    ]

    static let cultures = ["Ghanaian", "Nigerian", "Senegalese", "Ivorian", "Sierra Leonean", "Cameroonian", "Other"]
}
