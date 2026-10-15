import Foundation

// ---- catalog (bundled from the web app's DISHES and SNACKS, see Resources/catalog.json) ----

struct Variant: Decodable, Hashable {
    let text: String
    let cal: Int

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        text = try c.decode(String.self)
        cal = try c.decode(Int.self)
    }
}

struct Dish: Decodable, Identifiable, Hashable {
    let id: String
    let n: String
    let c: String
    let r: String
    let s: [String]
    let cal: Int
    let pr: Int
    let diet: [String]
    let al: [String]
    let t: [Int]
    let d: String
    let ing: [String]
    let steps: [String]
    let ways: [String]
    let pair: String
    let mp: String
    let light: Variant?
    let prot: Variant?

    var minutes: Int { t.reduce(0, +) }
}

struct SnackItem: Decodable, Identifiable, Hashable {
    let id: String
    let n: String
    let c: String
    let r: String
    let sv: String
    let cal: Int
    let al: [String]
    let how: String
}

struct PremiumFeature: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let blurb: String
    let phase: Int
}

struct ExerciseLine: Decodable, Hashable {
    let name: String
    let rx: String

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        name = try c.decode(String.self)
        rx = try c.decode(String.self)
    }
}

struct CatalogFile: Decodable {
    let dishes: [Dish]
    let snacks: [SnackItem]
    let premium: [PremiumFeature]
    let about: [String: String]
    let ex: [String: [String: [ExerciseLine]]]
}

// ---- logged data (what the web app keeps in S) ----

struct MealEntry: Codable, Identifiable, Hashable {
    var id = UUID()
    var date: String
    var slot: String
    var name: String
    var cal: Int
}

struct SnackEntry: Codable, Identifiable, Hashable {
    var id = UUID()
    var date: String
    var name: String
    var cal: Int
}

struct WorkoutEntry: Codable, Identifiable, Hashable {
    var id = UUID()
    var date: String
    var type: String
    var minutes: Int
    var cal: Int
    var note: String
}

struct WeightEntry: Codable, Identifiable, Hashable {
    var id = UUID()
    var date: String
    var kg: Double
}

struct Vitals: Codable, Hashable {
    var water: Int?
    var steps: Int?
    var active: Int?
    var rhr: Int?
    var sys: Int?
    var dia: Int?
    var spo2: Int?
    var sleep: Int?
}

struct Profile: Codable, Hashable {
    var name = "CJ"
    var metric = true
    var calorieGoal = 2200
    var workoutGoal = 3
    var region = "west"
    var coach = "strategist"
    var goal = "wellness"
    var level = "beginner"
    var freq = 3
    var accent = "blue"
    var appearance = 0 // 0 auto, 1 light, 2 dark
}

struct AppState: Codable {
    var profile = Profile()
    var meals: [MealEntry] = []
    var snacks: [SnackEntry] = []
    var workouts: [WorkoutEntry] = []
    var weights: [WeightEntry] = []
    var vitals: [String: Vitals] = [:]
    var planDone: [String] = []
    var seeded = false
}

// ---- fixed tables ----

struct Activity: Identifiable, Hashable {
    let id: String
    let name: String
    let group: String
    let met: Double
    let symbol: String
}

struct Option: Identifiable, Hashable {
    let id: String
    let name: String
    init(_ id: String, _ name: String) { self.id = id; self.name = name }
}

enum Tables {
    static let regions: [Option] = [
        Option("west", "West Africa"), Option("east", "East Africa"),
        Option("north", "North Africa"), Option("central", "Central Africa"),
        Option("south", "Southern Africa"), Option("caribbean", "Caribbean"),
        Option("latam", "Latin America"), Option("namerica", "North America"),
        Option("europe", "Europe"), Option("mideast", "Middle East"),
        Option("casia", "Central Asia & Caucasus"), Option("sasia", "South Asia"),
        Option("easia", "East Asia"), Option("seasia", "Southeast Asia"),
        Option("oceania", "Oceania"), Option("world", "Worldwide")
    ]

    static func regionName(_ id: String) -> String {
        regions.first { $0.id == id }?.name ?? id
    }

    static let slots: [Option] = [Option("breakfast", "Breakfast"), Option("lunch", "Lunch"), Option("dinner", "Dinner")]

    static let diets: [Option] = [
        Option("", "No preference"), Option("veg", "Vegetarian"), Option("vegan", "Vegan"),
        Option("hp", "High protein"), Option("lc", "Lower carb"), Option("gf", "Gluten-free")
    ]

    static let activityGroups: [Option] = [
        Option("cardio", "Cardio"), Option("strength", "Strength and studio"), Option("team", "Team sports"),
        Option("racket", "Racket and club sports"), Option("combat", "Combat"), Option("outdoor", "Water and outdoors"), Option("other", "Other")
    ]

    // MET values are the web app's own.
    static let activities: [Activity] = [
        Activity(id: "walk", name: "Walking", group: "cardio", met: 3.5, symbol: "figure.walk"),
        Activity(id: "run", name: "Running", group: "cardio", met: 9.8, symbol: "figure.run"),
        Activity(id: "cycle", name: "Cycling", group: "cardio", met: 7.5, symbol: "figure.outdoor.cycle"),
        Activity(id: "hike", name: "Hiking", group: "cardio", met: 6, symbol: "figure.hiking"),
        Activity(id: "elliptical", name: "Elliptical", group: "cardio", met: 5.5, symbol: "figure.elliptical"),
        Activity(id: "row", name: "Rowing", group: "cardio", met: 7, symbol: "figure.rower"),
        Activity(id: "strength", name: "Strength training", group: "strength", met: 5, symbol: "dumbbell.fill"),
        Activity(id: "calisthenics", name: "Bodyweight", group: "strength", met: 3.8, symbol: "figure.strengthtraining.functional"),
        Activity(id: "hiit", name: "HIIT", group: "strength", met: 8, symbol: "figure.highintensity.intervaltraining"),
        Activity(id: "yoga", name: "Yoga / mobility", group: "strength", met: 2.5, symbol: "figure.yoga"),
        Activity(id: "pilates", name: "Pilates", group: "strength", met: 3, symbol: "figure.pilates"),
        Activity(id: "dance", name: "Dance", group: "strength", met: 5, symbol: "figure.dance"),
        Activity(id: "soccer", name: "Soccer", group: "team", met: 7, symbol: "figure.soccer"),
        Activity(id: "basketball", name: "Basketball", group: "team", met: 6.5, symbol: "figure.basketball"),
        Activity(id: "volleyball", name: "Volleyball", group: "team", met: 4, symbol: "figure.volleyball"),
        Activity(id: "tennis", name: "Tennis", group: "racket", met: 7.3, symbol: "figure.tennis"),
        Activity(id: "badminton", name: "Badminton", group: "racket", met: 5.5, symbol: "figure.badminton"),
        Activity(id: "boxing", name: "Boxing", group: "combat", met: 5.5, symbol: "figure.boxing"),
        Activity(id: "martial", name: "Martial arts", group: "combat", met: 10.3, symbol: "figure.martial.arts"),
        Activity(id: "swim", name: "Swimming", group: "outdoor", met: 7, symbol: "figure.pool.swim"),
        Activity(id: "climb", name: "Climbing", group: "outdoor", met: 8, symbol: "figure.climbing"),
        Activity(id: "other", name: "Other", group: "other", met: 5, symbol: "figure.mixed.cardio")
    ]

    static func activity(_ id: String) -> Activity {
        activities.first { $0.id == id } ?? activities[activities.count - 1]
    }

    static let goals: [Option] = [
        Option("wellness", "General wellness"), Option("strength", "Build strength"), Option("lose", "Lose weight"),
        Option("gain", "Gain weight / muscle"), Option("endurance", "Improve endurance"), Option("habits", "Build healthy habits")
    ]

    static let levels: [Option] = [Option("beginner", "Beginner"), Option("intermediate", "Intermediate"), Option("advanced", "Advanced")]

    struct Coach: Identifiable {
        let id: String
        let label: String
        let sub: String
        let desc: String
        let symbol: String
    }

    static let coaches: [Coach] = [
        Coach(id: "motivator", label: "The Motivator", sub: "Empathetic & Uplifting",
              desc: "Positive reinforcement, healthy habits, and celebrating small wins. Offers grace for slip-ups and gently nudges you back on track toward steady progress.", symbol: "heart.fill"),
        Coach(id: "enforcer", label: "The Enforcer", sub: "Strict & Demanding",
              desc: "Pure discipline and optimal performance. Zero excuses, strict adherence to macros and routines, built to push advanced users past their limits.", symbol: "bolt.fill"),
        Coach(id: "strategist", label: "The Strategist", sub: "Balanced & Adaptive",
              desc: "Empathy with firm accountability. Rigid structure and goals, but adjusts intensity based on your daily feedback, knowing when to push and when to allow recovery.", symbol: "scope")
    ]

    static func coach(_ id: String) -> Coach { coaches.first { $0.id == id } ?? coaches[2] }
}

enum Dates {
    private static let fmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func string(_ d: Date) -> String { fmt.string(from: d) }
    static func date(_ s: String) -> Date { fmt.date(from: s) ?? Date() }
    static func today() -> String { string(Date()) }

    static func add(_ s: String, _ days: Int) -> String {
        string(Calendar.current.date(byAdding: .day, value: days, to: date(s)) ?? Date())
    }

    static func long(_ s: String) -> String {
        date(s).formatted(.dateTime.weekday(.wide).month(.wide).day())
    }

    static func short(_ s: String) -> String {
        date(s).formatted(.dateTime.month(.abbreviated).day())
    }

    static func weekday(_ s: String) -> String {
        date(s).formatted(.dateTime.weekday(.abbreviated))
    }

    // Monday of the week containing s.
    static func weekStart(_ s: String) -> String {
        let d = date(s)
        let wd = Calendar.current.component(.weekday, from: d) // 1 = Sunday
        return add(s, -((wd + 5) % 7))
    }
}
