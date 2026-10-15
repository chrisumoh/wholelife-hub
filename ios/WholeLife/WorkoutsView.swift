import SwiftUI

struct WorkoutsView: View {
    @EnvironmentObject var store: AppStore
    @State private var type = "strength"
    @State private var minutes = ""
    @State private var cal = ""
    @State private var note = ""

    var body: some View {
        Page(title: "Workouts") {
            weeklyCard
            logCard
            importCard
            historyCard
        }
    }

    private var weeklyCard: some View {
        let goal = store.state.profile.workoutGoal
        let done = store.weekWorkouts.count
        return HStack(spacing: 16) {
            ZStack {
                Circle().stroke(Theme.activity.opacity(0.18), lineWidth: 14)
                Circle().trim(from: 0, to: goal > 0 ? min(Double(done) / Double(goal), 1) : 0)
                    .stroke(Theme.activity, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Text("\(done)").font(.system(size: 28, weight: .bold)).monospacedDigit()
                    Text("of \(goal)").font(.footnote).foregroundStyle(Theme.gray)
                }
            }
            .frame(width: 96, height: 96)
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow("Weekly goal")
                Text("\(done) of \(goal) workouts this week").font(.title3.bold())
                Text(motivation).font(.subheadline).foregroundStyle(Theme.gray)
            }
        }
        .card()
    }

    private var motivation: String {
        let goal = store.state.profile.workoutGoal
        let left = goal - store.weekWorkouts.count
        if left <= 0 { return "Weekly goal met. Keep it easy and enjoy it." }
        return "\(left) more to reach your goal. A short walk counts."
    }

    private var logCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Log a workout").font(.title3.bold())
            ForEach(Tables.activityGroups) { g in
                let items = Tables.activities.filter { $0.group == g.id }
                VStack(alignment: .leading, spacing: 8) {
                    Eyebrow(g.name)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                        ForEach(items) { a in
                            Button {
                                type = a.id
                            } label: {
                                VStack(spacing: 6) {
                                    Image(systemName: a.symbol).font(.system(size: 22)).frame(height: 26)
                                    Text(a.name).font(.system(size: 12, weight: .medium)).lineLimit(1).minimumScaleFactor(0.7)
                                }
                                .foregroundStyle(type == a.id ? Color.white : Theme.activity)
                                .frame(maxWidth: .infinity, minHeight: 64)
                                .background(type == a.id ? Theme.activity : Theme.activity.opacity(0.12))
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            HStack(spacing: 12) {
                Field(title: "Minutes", text: $minutes, placeholder: "45", numeric: true)
                Field(title: "Calories (optional)", text: $cal, placeholder: "Estimated if blank", numeric: true)
            }
            Field(title: "Notes", text: $note, placeholder: "e.g. legs, 5K, pickup soccer")
            Button("Save workout") {
                guard let m = Int(minutes), m > 0 else { return }
                store.logWorkout(type: type, minutes: m, cal: Int(cal), note: note)
                minutes = ""
                cal = ""
                note = ""
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled((Int(minutes) ?? 0) <= 0)
        }
        .card()
    }

    private var importCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow("Apple Health and other apps")
            Text("Import workouts").font(.title3.bold())
            Text("Importing an Apple Health export or a Google, Fitbit, Strava or Garmin file is available on the website. It is not part of this iOS preview yet.")
                .font(.subheadline).foregroundStyle(Theme.gray)
            Link(destination: URL(string: "https://wholelife-hub.vercel.app/#/workouts") ?? URL(fileURLWithPath: "/")) {
                Label("Open on the website", systemImage: "arrow.up.right.square")
            }
            .buttonStyle(SoftButtonStyle())
        }
        .card()
    }

    private var historyCard: some View {
        let all = store.state.workouts.sorted { $0.date > $1.date }
        return VStack(alignment: .leading, spacing: 0) {
            Text("History").font(.title3.bold()).padding(.bottom, 8)
            if all.isEmpty { EmptyNote(text: "No workouts yet. Log your first one above.") }
            ForEach(Array(all.prefix(20).enumerated()), id: \.element.id) { i, w in
                let a = Tables.activity(w.type)
                HStack(spacing: 14) {
                    Image(systemName: a.symbol)
                        .font(.system(size: 20))
                        .foregroundStyle(Theme.activity)
                        .frame(width: 48, height: 48)
                        .background(Theme.activity.opacity(0.15))
                        .clipShape(Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(a.name).font(.system(size: 17, weight: .semibold))
                        Text("\(w.date == store.today ? "Today" : Dates.long(w.date)) · \(w.minutes) min\(w.note.isEmpty ? "" : " · \(w.note)")")
                            .font(.subheadline).foregroundStyle(Theme.gray)
                    }
                    Spacer()
                    Text("\(w.cal) cal").font(.subheadline.weight(.semibold)).monospacedDigit()
                    Button { store.deleteWorkout(w) } label: {
                        Image(systemName: "trash").foregroundStyle(Theme.bad).frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove workout")
                }
                .padding(.vertical, 8)
                if i < min(all.count, 20) - 1 { Divider() }
            }
        }
        .card()
    }
}
