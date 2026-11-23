import React, { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { ThemeProvider, useAppTheme } from "./src/context/ThemeContext";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { HistoryProvider, useHistory } from "./src/context/HistoryContext";
import { SettingsProvider, useSettings } from "./src/context/SettingsContext";
import { GUEST_SCAN_LIMIT } from "./src/config";
import { fetchGuestUsage, scanFile, scanUrl } from "./src/services/api";
import ShutterSplash from "./src/components/ShutterSplash";
import ScanningImageScreen from "./src/components/ScanningImageScreen";
import HowItWorksModal from "./src/components/HowItWorksModal";
import ExtensionModal from "./src/components/ExtensionModal";
import { hasSeenOnboarding, markOnboardingSeen } from "./src/utils/onboarding";
import WelcomeScreen from "./src/screens/WelcomeScreen";
import LoginScreen from "./src/screens/LoginScreen";
import SignUpScreen from "./src/screens/SignUpScreen";
import HomeScreen from "./src/screens/HomeScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import CameraScreen from "./src/screens/CameraScreen";
import ResultScreen from "./src/screens/ResultScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import ScanErrorScreen from "./src/screens/ScanErrorScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import AboutScreen from "./src/screens/AboutScreen";
import LimitScreen from "./src/screens/LimitScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import LinkScreen from "./src/screens/LinkScreen";
import TabBar from "./src/components/TabBar";
import ProfileScreen from "./src/screens/ProfileScreen";

// A short buzz that matches the outcome. Never allowed to crash the app.
function buzz(kind) {
  try {
    const type =
      kind === "success"
        ? Haptics.NotificationFeedbackType.Success
        : kind === "warning"
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error;
    Haptics.notificationAsync(type);
  } catch (e) {
    // devices without haptics just skip it
  }
}

// A readable file name for a pasted link, for example "photo.jpg"
function nameFromLink(link) {
  try {
    const last = decodeURIComponent(link.split("#")[0].split("?")[0].split("/").pop() || "");
    return last.includes(".") ? last.slice(0, 80) : "Image from link";
  } catch (e) {
    return "Image from link";
  }
}

function Flow({ onReady, splashDone }) {
  const { user, ready, signIn, signUp, signOut, deleteAccount, updateName, changePassword } = useAuth();
  const { addScan } = useHistory();
  const { guestScansUsed, incrementGuestScans, setGuestScansUsed } = useSettings();
  const [preloaderDone] = useState(true); // the shutter splash replaces the old start-up loader
  const [routed, setRouted] = useState(false);
  const [screen, setScreen] = useState("welcome");
  const [previousScreen, setPreviousScreen] = useState("home");
  const [detailFrom, setDetailFrom] = useState("home");
  const [settingsFrom, setSettingsFrom] = useState("home");
  const [scanFileData, setScanFileData] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [animDone, setAnimDone] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { colors } = useAppTheme();

  // First time this app is opened on this phone: show the "how it works" cards (null = still checking)
  const [showIntro, setShowIntro] = useState(null);
  useEffect(() => {
    hasSeenOnboarding().then((seen) => setShowIntro(!seen));
  }, []);

  // Tell the splash screen that the first real screen is ready underneath it
  useEffect(() => {
    if (ready && routed && showIntro !== null && onReady) onReady();
  }, [ready, routed, showIntro]);

  // Tell people about the Chrome extension once, right after the intro cards
  const [showExtension, setShowExtension] = useState(false);
  useEffect(() => {
    if (showIntro !== false) return;
    AsyncStorage.getItem("verisight_extension_seen4")
      .then((seen) => {
        if (seen !== "1") setShowExtension(true);
      })
      .catch(() => {});
  }, [showIntro]);

  const closeExtension = () => {
    setShowExtension(false);
    AsyncStorage.setItem("verisight_extension_seen4", "1").catch(() => {});
  };

  // Once the saved login has been checked: signed-in users go straight to their dashboard
  useEffect(() => {
    if (preloaderDone && ready && !routed) {
      setRouted(true);
      if (user) setScreen("dashboard");
    }
  }, [preloaderDone, ready, routed, user]);

  // Guests: ask the server how many free scans this phone has used (the server's count is the real one)
  useEffect(() => {
    if (!ready || user) return undefined;
    let cancelled = false;
    fetchGuestUsage()
      .then((usage) => {
        if (!cancelled) setGuestScansUsed(usage.used);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  // Move to the result once BOTH the loading animation and the server reply are done
  useEffect(() => {
    if (screen === "scanning" && animDone && scanResult) {
      const v = scanResult.verdict?.verdict;
      buzz(v === "ai_generated" ? "warning" : v === "inconclusive" ? "warning" : "success");
      setScreen("result");
    }
  }, [screen, animDone, scanResult]);

  // A different buzz when a scan fails
  useEffect(() => {
    if (scanError) buzz("error");
  }, [scanError]);

  const runScan = async (file, from) => {
    // Guests get a limited number of free scans (the server checks this too)
    if (!user && guestScansUsed >= GUEST_SCAN_LIMIT) {
      setScreen("limit");
      return;
    }

    setScanFileData(file);
    setPreviousScreen(from);
    setScanResult(null);
    setScanError(null);
    setAnimDone(false);
    setAttempt((n) => n + 1);
    setScreen("scanning");

    try {
      const result = file.remoteUrl ? await scanUrl(file.remoteUrl) : await scanFile(file);
      addScan(file, result);
      if (!user) incrementGuestScans();
      setScanResult(result);
    } catch (e) {
      if (e.kind === "link") {
        // a problem with the link itself: go back to the link box and show the message there
        setLinkError(e.message);
        setScreen("link");
        return;
      }
      if (e.kind === "guest_limit") {
        setGuestScansUsed(GUEST_SCAN_LIMIT);
        setScreen("limit");
        return;
      }
      if (e.kind === "auth") {
        await signOut();
        Alert.alert("Session expired", "Please sign in again.");
        setScreen("login");
        return;
      }
      setScanError(e);
    }
  };

  const openScan = (scan, from) => {
    setScanFileData({ uri: scan.uri, fileName: scan.fileName, createdAt: scan.createdAt });
    setScanResult(scan.result);
    setDetailFrom(from);
    setScreen("detail");
  };

  const openLink = (from) => {
    setPreviousScreen(from);
    setLinkDraft("");
    setLinkError(null);
    setScreen("link");
  };

  const submitLink = (rawUrl) => {
    let link = rawUrl.trim();
    if (!/^https?:\/\//i.test(link)) link = "https://" + link;
    setLinkDraft(rawUrl);
    setLinkError(null);
    runScan({ remoteUrl: link, uri: link, fileName: nameFromLink(link), type: "image" }, previousScreen);
  };

  const openSettings = (from) => {
    setSettingsFrom(from);
    setScreen("settings");
  };

  // "Continue as guest" means not being signed in
  const goGuest = async () => {
    if (user) await signOut();
    setScreen("home");
  };

  const doSignOut = async () => {
    await signOut();
    setScreen("welcome");
  };

  // ----- bottom navigation bar -----
  const homeScreen = user ? "dashboard" : "home";
  const guestBlocked = !user && guestScansUsed >= GUEST_SCAN_LIMIT;

  const tabHome = () => setScreen(homeScreen);
  const tabHistory = () => {
    setPreviousScreen(homeScreen);
    setScreen("history");
  };
  const tabCamera = () => {
    if (guestBlocked) {
      setScreen("limit");
      return;
    }
    setPreviousScreen(homeScreen);
    setScreen("camera");
  };
  const tabLink = () => {
    if (guestBlocked) {
      setScreen("limit");
      return;
    }
    openLink(homeScreen);
  };
  const tabProfile = () => {
    if (user) {
      setScreen("profile");
    } else {
      openSettings(homeScreen);
    }
  };

  // puts the bar under a main screen
  // (the extension popup waits until the splash screen has finished)
  const withTabs = (active, node) => (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1 }}>{node}</View>
      <ExtensionModal visible={showExtension && !!active && splashDone} onClose={closeExtension} />
      <TabBar
        active={active}
        profileLabel={user ? "Profile" : "Settings"}
        onHome={tabHome}
        onHistory={tabHistory}
        onCamera={tabCamera}
        onLink={tabLink}
        onProfile={tabProfile}
      />
    </View>
  );

  if (!ready || !routed || showIntro === null) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (showIntro) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <HowItWorksModal
          visible={splashDone}
          onClose={() => {
            markOnboardingSeen();
            setShowIntro(false);
          }}
        />
      </View>
    );
  }

  if (screen === "welcome") {
    return <WelcomeScreen onContinueAsGuest={goGuest} onSignIn={() => setScreen("login")} />;
  }

  if (screen === "login") {
    return (
      <LoginScreen
        onBack={() => setScreen("welcome")}
        onSignIn={async (creds) => {
          await signIn(creds);
          setScreen("dashboard");
        }}
        onForgotPassword={() => setScreen("forgot")}
        initialEmail={loginEmail}
        onCreateAccount={() => setScreen("signup")}
        onContinueAsGuest={goGuest}
      />
    );
  }

  if (screen === "signup") {
    return (
      <SignUpScreen
        onBack={() => setScreen("welcome")}
        onSignUp={async (data) => {
          await signUp(data);
          setScreen("dashboard");
        }}
        onSignIn={() => setScreen("login")}
      />
    );
  }

  if (screen === "forgot") {
    return (
      <ForgotPasswordScreen
        initialEmail={loginEmail}
        onBack={() => setScreen("login")}
        onFinished={(doneEmail) => {
          setLoginEmail(doneEmail);
          setScreen("login");
        }}
      />
    );
  }

  if (screen === "link") {
    return withTabs(
      "link",
      <LinkScreen
        initialUrl={linkDraft}
        error={linkError}
        onBack={() => setScreen(previousScreen)}
        onSubmit={submitLink}
      />
    );
  }

  if (screen === "limit") {
    return (
      <LimitScreen
        onBack={() => setScreen("home")}
        onSignUp={() => setScreen("signup")}
        onSignIn={() => setScreen("login")}
      />
    );
  }

  if (screen === "profile") {
    return withTabs(
      "profile",
      <ProfileScreen
        user={user}
        onUpdateName={updateName}
        onChangePassword={changePassword}
        onSettings={() => openSettings("profile")}
        onSignOut={doSignOut}
        onViewHistory={() => {
          setPreviousScreen("profile");
          setScreen("history");
        }}
        onOpenScan={(scan) => openScan(scan, "profile")}
      />
    );
  }

  if (screen === "settings") {
    return withTabs(
      "profile",
      <SettingsScreen
        user={user}
        onBack={() => setScreen(settingsFrom)}
        onSignIn={() => setScreen("login")}
        onSignOut={doSignOut}
        onDeleteAccount={async (password) => {
          await deleteAccount(password);
          setScreen("welcome");
        }}
        onAbout={() => setScreen("about")}
      />
    );
  }

  if (screen === "about") {
    return <AboutScreen onBack={() => setScreen("settings")} />;
  }

  if (screen === "camera") {
    return (
      <CameraScreen
        onBack={() => setScreen(previousScreen)}
        onCapture={(photo) => runScan(photo, previousScreen)}
      />
    );
  }

  if (screen === "scanning") {
    if (scanError) {
      return (
        <ScanErrorScreen
          error={scanError}
          onRetry={() => runScan(scanFileData, previousScreen)}
          onBack={() => setScreen(previousScreen)}
        />
      );
    }
    return (
      <ScanningImageScreen
        key={attempt}
        file={scanFileData}
        label={
          scanFileData?.type === "video"
            ? "Analyzing video, this can take a minute"
            : "Analyzing"
        }
        onComplete={() => setAnimDone(true)}
      />
    );
  }

  if (screen === "result") {
    return (
      <ResultScreen
        result={scanResult}
        file={scanFileData}
        onBack={() => setScreen(previousScreen)}
        onNewScan={() => setScreen(previousScreen)}
      />
    );
  }

  if (screen === "detail") {
    return (
      <ResultScreen
        result={scanResult}
        file={scanFileData}
        actionLabel="Back"
        onBack={() => setScreen(detailFrom)}
        onNewScan={() => setScreen(detailFrom)}
      />
    );
  }

  if (screen === "history") {
    return withTabs(
      "history",
      <HistoryScreen
        onBack={() => setScreen(previousScreen)}
        onOpenScan={(scan) => openScan(scan, "history")}
      />
    );
  }

  if (screen === "dashboard") {
    return withTabs(
      "home",
      <DashboardScreen
        user={user}
        onScan={(file) => runScan(file, "dashboard")}
        onScanLink={() => openLink("dashboard")}
        onUseCamera={() => {
          setPreviousScreen("dashboard");
          setScreen("camera");
        }}
        onOpenScan={(scan) => openScan(scan, "dashboard")}
        onViewHistory={() => {
          setPreviousScreen("dashboard");
          setScreen("history");
        }}
        onSettings={() => openSettings("dashboard")}
        onSignOut={doSignOut}
      />
    );
  }

  return withTabs(
    "home",
    <HomeScreen
      onBack={() => setScreen("welcome")}
      onScan={(file) => runScan(file, "home")}
      onScanLink={() => openLink("home")}
      onUseCamera={() => {
        setPreviousScreen("home");
        setScreen("camera");
      }}
      onOpenScan={(scan) => openScan(scan, "home")}
      onViewHistory={() => {
        setPreviousScreen("home");
        setScreen("history");
      }}
      onSettings={() => openSettings("home")}
      onLimitReached={() => setScreen("limit")}
    />
  );
}

export default function App() {
  const [flowReady, setFlowReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: "#241711" }}>
      <ThemeProvider>
        <SettingsProvider>
          <AuthProvider>
            <HistoryProvider>
              <Flow onReady={() => setFlowReady(true)} splashDone={splashDone} />
            </HistoryProvider>
          </AuthProvider>
        </SettingsProvider>
      </ThemeProvider>
      {!splashDone && <ShutterSplash ready={flowReady} onFinish={() => setSplashDone(true)} />}
    </View>
  );
}