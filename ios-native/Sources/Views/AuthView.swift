import SwiftUI

struct AuthView: View {
    @EnvironmentObject var store: AppStore
    @State private var email = ""
    @State private var password = ""
    @State private var creating = false
    @FocusState private var focus: Field?
    enum Field { case email, password }

    var body: some View {
        ZStack {
            GlassBackground()
            VStack(spacing: 18) {
                Spacer()
                Image(systemName: "circle.hexagongrid.fill")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(.primary)
                    .frame(width: 80, height: 80)
                    .liquidGlass(cornerRadius: 24)

                Text(creating ? store.t("Create your account") : store.t("Welcome back"))
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                Text(creating ? store.t("Join AskAI — chats sync across web, Android & iOS.")
                              : store.t("Sign in to continue to AskAI."))
                    .font(.system(size: 13)).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center).padding(.horizontal, 32)

                VStack(spacing: 12) {
                    TextField(store.t("Email"), text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .email)
                        .padding(.horizontal, 16).padding(.vertical, 14)
                        .liquidGlass(cornerRadius: 18)

                    SecureField(store.t("Password"), text: $password)
                        .textContentType(creating ? .newPassword : .password)
                        .focused($focus, equals: .password)
                        .padding(.horizontal, 16).padding(.vertical, 14)
                        .liquidGlass(cornerRadius: 18)
                }
                .padding(.horizontal, 24)

                if let err = store.errorText {
                    Text(err).font(.caption).foregroundStyle(.red).padding(.horizontal, 24)
                }

                Button {
                    focus = nil
                    Task { await store.signIn(email: email, password: password, creating: creating) }
                } label: {
                    HStack {
                        if store.authBusy { ProgressView().tint(Color(uiColor: .systemBackground)) }
                        Text(creating ? store.t("Create account") : store.t("Sign in")).fontWeight(.bold)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 15)
                    .background(Color.primary, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .foregroundStyle(Color(uiColor: .systemBackground))
                }
                .buttonStyle(PressableButtonStyle())
                .disabled(email.isEmpty || password.count < 6 || store.authBusy)
                .opacity((email.isEmpty || password.count < 6) ? 0.5 : 1)
                .padding(.horizontal, 24)

                Button(creating ? store.t("I already have an account") : store.t("New to AskAI? Create an account")) {
                    creating.toggle(); store.errorText = nil
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.primary)

                Spacer()
                Button(store.t("Continue without an account")) { store.continueAsGuest() }
                    .font(.system(size: 13)).foregroundStyle(.secondary)
                    .padding(.bottom, 16)
            }
        }
        .preferredColorScheme(store.colorScheme)
    }
}
