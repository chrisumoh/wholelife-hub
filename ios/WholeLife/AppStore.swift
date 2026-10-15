import SwiftUI

// Shared state. Plays the role of the web app's S and UI objects. Everything is kept on the device
// (UserDefaults); there is no Supabase sync in this preview.
final class AppStore: ObservableObject {
    private static let key = "wlh.ios.state"

    @Published var state = AppState() {
        didSet { save() }
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.key),
           let s = try? JSONDecoder().decode(AppState.self, from: data) {
            state = s
        }
        if !state.seeded { loadSample() }
        save()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
    }

    // ---- appearance ----

    var accent: Color {
        switch state.profile.accent {
        case "green": return Theme.food
        case "gold": return Theme.gold
        case "coral": return Theme.activity
        case "purple": return Theme.sleep
        default: return Color.blue
        }
    }

    var scheme: ColorScheme? {
        switch state.profile.appearance {
        case 1: return .light
        case 2: return .dark
        default: return nil
        }
    }

    // ---- reading logs ----

    var today: String { Dates.today() }

    func meals(on d: String) -> [MealEntry] { state.meals.filter { $0.date == d } }
    func snacks(on d: String) -> [SnackEntry] { state.snacks.filter { $0.date == d } }
    func workouts(on d: String) -> [WorkoutEntry] { state.workouts.filter { $0.date == d } }
    func vitals(on d: String) -> Vitals { state.vitals[d] ?? Vitals() }

    func intake(on d: String) -> Int {
        meals(on: d).map { $0.cal }.reduce(0, +) + snacks(on: d).map { $0.cal }.reduce(0, +)
    }

    func hasFood(on d: String) -> Bool { !meals(on: d).isEmpty || !snacks(on: d).isEmpty }

    func minutes(on d: String) -> Int { workouts(on: d).map { $0.minutes }.reduce(0, +) }

    func burned(on d: String) -> Int { workouts(on: d).map { $0.cal }.reduce(0, +) }

    func days(_ n: Int) -> [String] {
        (0..<n).map { Dates.add(today, -(n - 1 - $0)) }
    }

    var weekWorkouts: [WorkoutEntry] {
        let start = Dates.weekStart(today)
        return state.workouts.filter { $0.date >= start && $0.date <= today }
    }

    var weekMinutes: Int { weekWorkouts.map { $0.minutes }.reduce(0, +) }

    var latestWeight: WeightEntry? { state.weights.max { $0.date < $1.date } }

    var streak: Int {
        var d = today
        if workouts(on: d).isEmpty { d = Dates.add(d, -1) }
        var n = 0
        while !workouts(on: d).isEmpty && n < 1000 {
            n += 1
            d = Dates.add(d, -1)
        }
        return n
    }

    var bestStreak: Int {
        let dates = Set(state.workouts.map { $0.date }).sorted()
        var best = 0, run = 0
        var prev: String? = nil
        for d in dates {
            if let p = prev, Dates.add(p, 1) == d { run += 1 } else { run = 1 }
            best = max(best, run)
            prev = d
        }
        return best
    }

    var lastUpdated: String {
        let all = (state.meals.map { $0.date } + state.workouts.map { $0.date } + state.snacks.map { $0.date }).max()
        guard let d = all else { return "Nothing logged yet" }
        return d == today ? "Updated today" : "Last logged \(Dates.short(d))"
    }

    // ---- rings (the web app's RING_DEFS) ----

    struct Ring: Identifiable {
        let id: String
        let name: String
        let symbol: String
        let value: Double
        let goal: Double
        let unit: String
        let sub: String
        let color: Color
        var fraction: Double { goal > 0 ? min(value / goal, 1) : 0 }
        var closed: Bool { goal > 0 && value >= goal }
    }

    func rings(on d: String? = nil) -> [Ring] {
        let day = d ?? today
        return [
            Ring(id: "move", name: "Move", symbol: "fork.knife", value: Double(intake(on: day)), goal: Double(state.profile.calorieGoal),
                 unit: "cal", sub: "eaten today", color: Theme.food),
            Ring(id: "exercise", name: "Exercise", symbol: "dumbbell.fill", value: Double(weekMinutes), goal: Double(state.profile.workoutGoal * 40),
                 unit: "min", sub: "this week", color: Theme.activity),
            Ring(id: "hydration", name: "Hydration", symbol: "drop.fill", value: Double(vitals(on: day).water ?? 0), goal: 2700,
                 unit: "mL", sub: "today", color: Theme.water)
        ]
    }

    // ---- weights ----

    func weightText(_ kg: Double) -> String {
        state.profile.metric ? String(format: "%.1f kg", kg) : String(format: "%.1f lb", kg * 2.20462)
    }

    // ---- writing ----

    func logMeal(slot: String, name: String, cal: Int, date: String? = nil) {
        state.meals.append(MealEntry(date: date ?? today, slot: slot, name: name, cal: cal))
    }

    func logSnack(name: String, cal: Int) {
        state.snacks.append(SnackEntry(date: today, name: name, cal: cal))
    }

    func logWorkout(type: String, minutes: Int, cal: Int?, note: String) {
        let act = Tables.activity(type)
        let kg = latestWeight?.kg ?? 70
        let est = cal ?? Int((act.met * kg * Double(minutes) / 60).rounded())
        state.workouts.append(WorkoutEntry(date: today, type: type, minutes: minutes, cal: est, note: note))
    }

    func logWeight(kg: Double) {
        state.weights.removeAll { $0.date == today }
        state.weights.append(WeightEntry(date: today, kg: kg))
    }

    func addVital(_ change: (inout Vitals) -> Void) {
        var v = vitals(on: today)
        change(&v)
        state.vitals[today] = v
    }

    func addWater(_ ml: Int) { addVital { $0.water = min(($0.water ?? 0) + ml, 10000) } }

    func deleteMeal(_ m: MealEntry) { state.meals.removeAll { $0.id == m.id } }
    func deleteSnack(_ s: SnackEntry) { state.snacks.removeAll { $0.id == s.id } }
    func deleteWorkout(_ w: WorkoutEntry) { state.workouts.removeAll { $0.id == w.id } }

    // ---- sample data and reset ----

    func clearAll() {
        let p = state.profile
        state = AppState()
        state.profile = p
        state.seeded = true
    }

    // A week of made-up entries so every screen has something to show. It is labelled as sample data in Settings.
    func loadSample() {
        var s = AppState()
        s.profile = state.profile
        s.seeded = true
        let t = Dates.today()
        let foods: [[(String, String, Int)]] = [
            [("breakfast", "Akara with pap", 380), ("lunch", "Jollof rice with chicken", 560), ("dinner", "Egusi soup with pounded yam", 640)],
            [("breakfast", "Waakye", 520), ("lunch", "Red red with fried plantain", 560), ("dinner", "Grilled tilapia with banku", 480)],
            [("breakfast", "Moi moi", 300), ("lunch", "Fufu with light soup", 540), ("dinner", "Jollof rice with chicken", 560)],
            [("breakfast", "Oatmeal with groundnuts", 340), ("lunch", "Waakye", 520), ("dinner", "Suya with salad", 430)],
            [("breakfast", "Akara with pap", 380), ("lunch", "Kenkey with fish", 500), ("dinner", "Egusi soup with eba", 620)],
            [("breakfast", "Moi moi", 300), ("lunch", "Jollof rice with chicken", 560), ("dinner", "Pepper soup", 380)]
        ]
        for i in 0..<6 {
            let d = Dates.add(t, -(6 - i))
            for f in foods[i] { s.meals.append(MealEntry(date: d, slot: f.0, name: f.1, cal: f.2)) }
            s.vitals[d] = Vitals(water: [2200, 2500, 1800, 2700, 2300, 2100][i], steps: [7400, 9100, 6200, 10400, 8300, 5600][i],
                                 active: [310, 420, 260, 480, 350, 240][i], rhr: [64, 63, 65, 62, 63, 64][i],
                                 sys: nil, dia: nil, spo2: [97, 98, 97, 98, 97, 98][i], sleep: [440, 410, 470, 430, 455, 400][i])
        }
        s.meals.append(MealEntry(date: t, slot: "breakfast", name: "Akara with pap", cal: 380))
        s.meals.append(MealEntry(date: t, slot: "lunch", name: "Jollof rice with chicken", cal: 560))
        s.snacks.append(SnackEntry(date: t, name: "Roasted groundnuts", cal: 170))
        s.vitals[t] = Vitals(water: 1400, steps: 4100, active: 180, rhr: 63, sys: 118, dia: 76, spo2: 98, sleep: 420)
        s.workouts = [
            WorkoutEntry(date: Dates.add(t, -5), type: "walk", minutes: 40, cal: 160, note: ""),
            WorkoutEntry(date: Dates.add(t, -3), type: "strength", minutes: 55, cal: 340, note: "Full body"),
            WorkoutEntry(date: Dates.add(t, -2), type: "soccer", minutes: 65, cal: 520, note: "Pickup game"),
            WorkoutEntry(date: Dates.add(t, -1), type: "run", minutes: 30, cal: 330, note: "Easy pace"),
            WorkoutEntry(date: t, type: "walk", minutes: 25, cal: 105, note: "")
        ]
        s.weights = [
            WeightEntry(date: Dates.add(t, -21), kg: 82.1), WeightEntry(date: Dates.add(t, -14), kg: 81.6),
            WeightEntry(date: Dates.add(t, -7), kg: 81.2), WeightEntry(date: Dates.add(t, -3), kg: 80.9),
            WeightEntry(date: t, kg: 80.7)
        ]
        state = s
    }

    // ---- badges (computed from what is logged, like the web app) ----

    struct Badge: Identifiable {
        let id: String
        let name: String
        let detail: String
        let symbol: String
        let earned: Bool
        let progress: Double
    }

    var badges: [Badge] {
        let n = state.workouts.count
        let best = bestStreak
        let perfect = days(60).contains { d in rings(on: d).filter { $0.id != "exercise" }.allSatisfy { $0.closed } }
        let monthPrefix = String(today.prefix(7))
        let foodDays = Set(state.meals.filter { $0.date.hasPrefix(monthPrefix) }.map { $0.date }).count
        let months = Set(state.workouts.map { String($0.date.prefix(7)) }).count
        func b(_ id: String, _ name: String, _ detail: String, _ symbol: String, _ have: Int, _ need: Int) -> Badge {
            Badge(id: id, name: name, detail: detail, symbol: symbol, earned: have >= need, progress: min(Double(have) / Double(need), 1))
        }
        return [
            b("first-workout", "First Move", "Log your first workout.", "figure.run", n, 1),
            b("ten-workouts", "Ten Sessions", "Log 10 workouts.", "dumbbell.fill", n, 10),
            b("fifty-workouts", "Fifty Sessions", "Log 50 workouts.", "figure.highintensity.intervaltraining", n, 50),
            b("hundred", "Century", "Log 100 workouts.", "figure.outdoor.cycle", n, 100),
            b("streak-7", "Seven Days", "Work out seven days in a row.", "figure.walk", best, 7),
            b("streak-30", "Thirty Days", "Work out thirty days in a row.", "figure.hiking", best, 30),
            b("perfect-day", "Food and Water", "Close the Move and Hydration rings in one day.", "target", perfect ? 1 : 0, 1),
            b("food-logger", "Honest Logger", "Log food on 25 days in one month.", "fork.knife", foodDays, 25),
            b("three-months", "Quarter", "Log a workout in three different months.", "calendar", months, 3)
        ]
    }
}
