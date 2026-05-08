use std::process::Child;
use std::sync::Mutex;
use tauri::Manager;

pub struct BackendProcess(pub Mutex<Option<Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.to_path_buf()));

            if let Some(dir) = exe_dir {
                let bin_name = if cfg!(target_os = "windows") {
                    "backend.exe"
                } else {
                    "backend"
                };
                let backend_path = dir.join(bin_name);

                if backend_path.exists() {
                    match std::process::Command::new(&backend_path)
                        .args(["--port", "18432"])
                        .spawn()
                    {
                        Ok(child) => {
                            *app.state::<BackendProcess>().0.lock().unwrap() = Some(child);
                            // Give backend time to initialize before the window loads
                            std::thread::sleep(std::time::Duration::from_secs(3));
                        }
                        Err(e) => eprintln!("Failed to start backend: {e}"),
                    }
                } else {
                    // Dev mode: run Python backend manually
                    // cd backend && python main.py --port 18432
                    eprintln!("Backend binary not found at {}. Run Python backend manually for dev.", backend_path.display());
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Kill the Python sidecar when the app closes
                if let Some(mut child) = app_handle
                    .state::<BackendProcess>()
                    .0
                    .lock()
                    .unwrap()
                    .take()
                {
                    let _ = child.kill();
                }
            }
        });
}
