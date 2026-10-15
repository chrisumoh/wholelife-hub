import SwiftUI

struct CoachView: View {
    @EnvironmentObject var store: AppStore

    private var coach: Tables.Coach { Tables.coach(store.state.profile.coach) }

    var body: some View {
        Page(title: "Personal coach") {
            heroCard
            adviceCard
            personaCard
            planCard
        }
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Eyebrow(coach.label, color: Theme.coach)
                Spacer()
                HStack(spacing: 4) {
                    Image(systemName: coach.symbol)
                    Text(coach.sub).font(.system(size: 12))
                }
                .foregroundStyle(Theme.gray)
            }
            Text(greeting).font(.footnote).foregroundStyle(Theme.gray)
            Text(headline).font(.system(size: 20, weight: .semibold))
            HStack {
                Text("Goal: ").foregroundStyle(Theme.gray) + Text(Tables.goals.first { $0.id == store.state.profile.goal }?.name ?? "Not set").bold()
                Spacer()
                Text("Streak: ").foregroundStyle(Theme.gray) + Text("\(store.streak)d").bold()
            }
            .font(.footnote)
        }
        .card()
    }

    private var greeting: String {
        let name = store.state.profile.name
        switch coach.id {
        case "motivator": return "Hi \(name), glad you're here."
        case "enforcer": return "\(name), let's get to work."
        default: return "Hi \(name). Here is where you stand."
        }
    }

    private var headline: String {
        let left = store.state.profile.workoutGoal - store.weekWorkouts.count
        if left <= 0 {
            switch coach.id {
            case "motivator": return "Your weekly workout goal is done. That took real effort."
            case "enforcer": return "Weekly goal met. Don't coast; hold the standard."
            default: return "Weekly goal met. Recover well and keep the rhythm."
            }
        }
        switch coach.id {
        case "motivator": return "\(left) more workout\(left == 1 ? "" : "s") and you hit your week. You've got this."
        case "enforcer": return "\(left) workout\(left == 1 ? "" : "s") left this week. No excuses."
        default: return "\(left) workout\(left == 1 ? "" : "s") left this week. Pick the day that fits."
        }
    }

    // Advice is written from the numbers already logged, nothing invented.
    private var adviceCard: some View {
        let eaten = store.intake(on: store.today)
        let goal = store.state.profile.calorieGoal
        let water = store.vitals(on: store.today).water ?? 0
        var lines: [(String, String)] = []
        if !store.hasFood(on: store.today) {
            lines.append(("fork.knife", "Nothing logged yet today. Log your first meal so the day adds up."))
        } else if eaten < goal {
            lines.append(("fork.knife", "You've eaten \(eaten.formatted()) of \(goal.formatted()) cal. \((goal - eaten).formatted()) cal left."))
        } else {
            lines.append(("fork.knife", "You're \((eaten - goal).formatted()) cal over your target today. One day doesn't decide the week."))
        }
        if water < 2700 {
            lines.append(("drop.fill", "Water is at \(water.formatted()) of 2,700 mL. A glass now helps."))
        } else {
            lines.append(("drop.fill", "Hydration ring closed. Nice."))
        }
        if store.workouts(on: store.today).isEmpty {
            lines.append(("figure.walk", "No workout yet today. Even a 20 minute walk counts."))
        }
        return VStack(alignment: .leading, spacing: 0) {
            Text("Today's advice").font(.title3.bold()).padding(.bottom, 6)
            ForEach(Array(lines.enumerated()), id: \.offset) { i, l in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: l.0).foregroundStyle(Theme.coach).frame(width: 24)
                    Text(l.1).font(.subheadline)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 8)
                if i < lines.count - 1 { Divider() }
            }
        }
        .card()
    }

    private var personaCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Coaching style").font(.title3.bold())
            ForEach(Tables.coaches) { c in
                Button {
                    store.state.profile.coach = c.id
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: c.symbol)
                            .foregroundStyle(.white)
                            .frame(width: 32, height: 32)
                            .background(Theme.coachTile)
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.label).font(.system(size: 17, weight: .semibold)).foregroundStyle(.primary)
                            Text(c.sub).font(.footnote).foregroundStyle(Theme.coach)
                            Text(c.desc).font(.footnote).foregroundStyle(Theme.gray).multilineTextAlignment(.leading)
                        }
                        Spacer()
                        if c.id == coach.id { Image(systemName: "checkmark.circle.fill").foregroundStyle(.tint) }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .card()
    }

    // ---- weekly plan, built from the web app's exercise tables ----

    private struct PlanDay: Identifiable {
        let id: Int // day of week, 1 = Sunday
        let kind: String
        var title: String {
            switch kind {
            case "fullbody": return "Full body"
            case "upper": return "Upper body"
            case "lower": return "Lower body"
            case "cardio": return "Cardio"
            case "hiit": return "HIIT"
            default: return "Mobility"
            }
        }
        var activity: String {
            switch kind {
            case "cardio": return "run"
            case "hiit": return "hiit"
            case "mobility": return "yoga"
            default: return "strength"
            }
        }
        var minutes: Int { kind == "cardio" || kind == "mobility" ? 30 : 40 }
    }

    private var plan: [PlanDay] {
        let p = store.state.profile
        let slots: [Int: [Int]] = [1: [2], 2: [2, 5], 3: [2, 4, 6], 4: [2, 3, 5, 6], 5: [2, 3, 4, 6, 7], 6: [2, 3, 4, 5, 6, 7]]
        let days = slots[min(max(p.freq, 1), 6)] ?? [2, 4, 6]
        let order: [String]
        if p.goal == "endurance" {
            order = ["cardio", "lower", "cardio", "hiit", "cardio", "mobility"]
        } else if p.goal == "strength" || p.goal == "gain" {
            order = ["upper", "lower", "fullbody", "upper", "lower", "mobility"]
        } else {
            order = ["fullbody", "cardio", "lower", "upper", "hiit", "mobility"]
        }
        return days.enumerated().map { PlanDay(id: $1, kind: order[$0 % order.count]) }
    }

    private func date(for day: PlanDay) -> String {
        let start = Dates.weekStart(store.today)
        return Dates.add(start, (day.id + 5) % 7)
    }

    private var planCard: some View {
        let p = store.state.profile
        let todayDow = Calendar.current.component(.weekday, from: Date())
        return VStack(alignment: .leading, spacing: 14) {
            Eyebrow("Workout advice")
            Text("Your weekly plan").font(.title3.bold())
            HStack {
                Stepper("Days: \(p.freq)", value: Binding(get: { store.state.profile.freq }, set: { store.state.profile.freq = $0 }), in: 1...6)
            }
            Picker("Level", selection: Binding(get: { store.state.profile.level }, set: { store.state.profile.level = $0 })) {
                ForEach(Tables.levels) { l in Text(l.name).tag(l.id) }
            }
            .pickerStyle(.segmented)
            Picker("Goal", selection: Binding(get: { store.state.profile.goal }, set: { store.state.profile.goal = $0 })) {
                ForEach(Tables.goals) { g in Text(g.name).tag(g.id) }
            }

            ForEach(plan) { d in
                let day = date(for: d)
                let done = store.state.planDone.contains("\(day)|\(d.kind)")
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Eyebrow(Dates.weekday(day) + (d.id == todayDow ? " · today" : ""), color: d.id == todayDow ? Theme.activity : Theme.gray)
                        Spacer()
                        Text("\(d.minutes) min").font(.footnote).foregroundStyle(Theme.gray)
                    }
                    Text(d.title).font(.headline)
                    ForEach(exercises(d.kind), id: \.name) { e in
                        HStack(alignment: .top) {
                            Text(e.name).font(.subheadline)
                            Spacer()
                            Text(e.rx).font(.subheadline).foregroundStyle(Theme.gray)
                        }
                    }
                    if done {
                        Tag(text: "Done")
                    } else {
                        Button("Mark done") { markDone(d, day) }
                            .buttonStyle(SoftButtonStyle())
                            .disabled(day > store.today)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.field)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            Text("Warm up 5 to 10 minutes before each session. Stop if something hurts, not just burns, and check with a doctor before starting if you have a health condition.")
                .font(.footnote).foregroundStyle(Theme.gray)
        }
        .card()
    }

    private func exercises(_ kind: String) -> [ExerciseLine] {
        Catalog.shared.ex[kind]?[store.state.profile.level] ?? []
    }

    private func markDone(_ d: PlanDay, _ day: String) {
        store.state.planDone.append("\(day)|\(d.kind)")
        store.logWorkout(type: d.activity, minutes: d.minutes, cal: nil, note: d.title)
    }
}
