import SwiftUI

struct MoreView: View {
    var body: some View {
        List {
            Section("Eat & train") {
                row("Recipes & meal plans", "book.fill", Theme.food) { RecipesView() }
                row("Food culture", "globe", Theme.water) { CultureView() }
            }
            Section("Track") {
                row("Achievements & Goals", "medal.fill", Theme.gold) { AwardsView() }
            }
            Section("Account") {
                row("Settings & profiles", "gearshape.fill", Theme.gray) { SettingsView() }
            }
        }
        .navigationTitle("More")
    }

    private func row<D: View>(_ title: String, _ symbol: String, _ color: Color, @ViewBuilder dest: () -> D) -> some View {
        let destination = dest()
        return NavigationLink {
            destination
        } label: {
            HStack(spacing: 12) {
                IconTile(symbol: symbol, color: color)
                Text(title)
            }
        }
    }
}

struct RecipesView: View {
    var body: some View {
        Page(title: "Recipes") {
            ForEach(Sample.recipes) { r in
                NavigationLink { RecipeDetail(recipe: r) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(r.name).font(.headline).foregroundStyle(.primary)
                        Text("\(r.origin) · \(r.calories) kcal · \(r.minutes) min")
                            .font(.subheadline).foregroundStyle(Theme.gray)
                        Text(r.summary).font(.subheadline).foregroundStyle(Theme.gray).lineLimit(2)
                    }
                    .card()
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct RecipeDetail: View {
    let recipe: Recipe

    var body: some View {
        Page(title: recipe.name) {
            Text(recipe.summary).card()
            SectionTitle("Ingredients")
            VStack(alignment: .leading, spacing: 8) {
                ForEach(recipe.ingredients, id: \.self) { Text($0) }
            }
            .card()
            SectionTitle("Steps")
            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(recipe.steps.enumerated()), id: \.offset) { i, s in
                    Text("\(i + 1). \(s)")
                }
            }
            .card()
        }
    }
}

struct CultureView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        List(Sample.cultures, id: \.self) { c in
            Button {
                store.culture = c
            } label: {
                HStack {
                    Text(c).foregroundStyle(.primary)
                    Spacer()
                    if store.culture == c { Image(systemName: "checkmark").foregroundStyle(.tint) }
                }
            }
        }
        .navigationTitle("Food culture")
    }
}

struct AwardsView: View {
    var body: some View {
        Page(title: "Achievements") {
            ForEach(Sample.achievements) { a in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: a.progress >= 1 ? "medal.fill" : "medal").foregroundStyle(Theme.gold)
                        Text(a.name).font(.headline)
                    }
                    Text(a.detail).font(.subheadline).foregroundStyle(Theme.gray)
                    ProgressBar(fraction: a.progress, color: Theme.gold)
                }
                .card()
            }
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        Form {
            Section("Profile") {
                TextField("Name", text: $store.name)
                Toggle("Use kilograms", isOn: $store.useMetric)
            }
            Section("About") {
                LabeledContent("Version", value: "8.2.22 (iOS preview)")
                Text("This is a preview of the Whole Life look in SwiftUI. It uses sample data and does not sync.")
                    .font(.footnote).foregroundStyle(Theme.gray)
            }
        }
        .navigationTitle("Settings")
    }
}
