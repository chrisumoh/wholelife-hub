import SwiftUI

struct RootView: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        TabView {
            NavigationStack { SummaryView() }
                .tabItem { Label("Summary", systemImage: "heart.text.square.fill") }
            NavigationStack { MealsView() }
                .tabItem { Label("Meals", systemImage: "fork.knife") }
            NavigationStack { WorkoutsView() }
                .tabItem { Label("Workouts", systemImage: "figure.run") }
            NavigationStack { CoachView() }
                .tabItem { Label("Coach", systemImage: "stopwatch.fill") }
            NavigationStack { MenuView() }
                .tabItem { Label("Menu", systemImage: "line.3.horizontal") }
        }
        .tint(store.accent)
        .preferredColorScheme(store.scheme)
    }
}

#Preview {
    RootView().environmentObject(AppStore())
}
