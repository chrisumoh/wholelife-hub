import SwiftUI

// The web app's METRICS table, reduced to what the iOS screens need.
struct MetricDef: Identifiable {
    let id: String
    let name: String
    let symbol: String
    let color: Color
    let unit: String
    let category: String
}

enum Metrics {
    static let categories: [Option] = [
        Option("nutrition", "Nutrition"), Option("activity", "Activity"), Option("body", "Body"),
        Option("heart", "Heart"), Option("resp", "Respiratory"), Option("sleep", "Sleep")
    ]

    static let all: [MetricDef] = [
        MetricDef(id: "calories", name: "Calories eaten", symbol: "fork.knife", color: Theme.food, unit: "cal", category: "nutrition"),
        MetricDef(id: "water", name: "Water", symbol: "drop.fill", color: Theme.water, unit: "mL", category: "nutrition"),
        MetricDef(id: "workouts", name: "Workouts", symbol: "dumbbell.fill", color: Theme.activity, unit: "min", category: "activity"),
        MetricDef(id: "steps", name: "Steps", symbol: "figure.walk", color: Theme.activity, unit: "steps", category: "activity"),
        MetricDef(id: "active", name: "Active energy", symbol: "flame.fill", color: Theme.activity, unit: "cal", category: "activity"),
        MetricDef(id: "weight", name: "Weight", symbol: "scalemass.fill", color: Theme.coach, unit: "kg", category: "body"),
        MetricDef(id: "rhr", name: "Resting heart rate", symbol: "heart.text.square.fill", color: Theme.heart, unit: "BPM", category: "heart"),
        MetricDef(id: "bp", name: "Blood pressure", symbol: "waveform.path.ecg", color: Theme.heart, unit: "mmHg", category: "heart"),
        MetricDef(id: "spo2", name: "Blood oxygen", symbol: "lungs.fill", color: Theme.water, unit: "%", category: "resp"),
        MetricDef(id: "sleep", name: "Sleep", symbol: "bed.double.fill", color: Theme.sleep, unit: "hr", category: "sleep")
    ]

    static func def(_ id: String) -> MetricDef { all.first { $0.id == id } ?? all[0] }
}

extension AppStore {
    // One value per day, nil when nothing was logged that day.
    func value(_ metric: String, on d: String) -> Double? {
        let v = vitals(on: d)
        switch metric {
        case "calories": return hasFood(on: d) ? Double(intake(on: d)) : nil
        case "water": return v.water.map(Double.init)
        case "workouts": return workouts(on: d).isEmpty ? nil : Double(minutes(on: d))
        case "steps": return v.steps.map(Double.init)
        case "active": return v.active.map(Double.init)
        case "weight": return state.weights.first { $0.date == d }?.kg
        case "rhr": return v.rhr.map(Double.init)
        case "bp": return v.sys.map(Double.init)
        case "spo2": return v.spo2.map(Double.init)
        case "sleep": return v.sleep.map { Double($0) / 60 }
        default: return nil
        }
    }

    func series(_ metric: String, days n: Int) -> [(date: String, value: Double?)] {
        days(n).map { ($0, value(metric, on: $0)) }
    }

    func latest(_ metric: String) -> (date: String, value: Double)? {
        for d in days(60).reversed() {
            if let v = value(metric, on: d) { return (d, v) }
        }
        return nil
    }

    func format(_ metric: String, _ v: Double) -> String {
        switch metric {
        case "weight":
            return state.profile.metric ? String(format: "%.1f", v) : String(format: "%.1f", v * 2.20462)
        case "sleep":
            return String(format: "%.1f", v)
        case "bp":
            let d = vitals(on: today).dia ?? 0
            return d > 0 ? "\(Int(v))/\(d)" : "\(Int(v))"
        default:
            return Int(v.rounded()).formatted()
        }
    }

    func unit(_ metric: String) -> String {
        switch metric {
        case "weight": return state.profile.metric ? "kg" : "lb"
        default: return Metrics.def(metric).unit
        }
    }

    func bars(_ metric: String, days n: Int = 7) -> [Double] {
        series(metric, days: n).map { $0.value ?? 0 }
    }
}
