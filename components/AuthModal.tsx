import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, getAdditionalUserInfo } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebaseConfig';

const AuthModal: React.FC = () => {
    const [view, setView] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [retypePassword, setRetypePassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [dob, setDob] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Password Validation State
    const [passValid, setPassValid] = useState({
        length: false,
        upper: false,
        number: false,
        symbol: false
    });

    useEffect(() => {
        setPassValid({
            length: password.length >= 8,
            upper: /[A-Z]/.test(password),
            number: /[0-9]/.test(password),
            symbol: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        });
    }, [password]);

    const isPasswordStrong = passValid.length && passValid.upper && passValid.number && passValid.symbol;

    const handleSignIn = async () => {
        setLoading(true);
        setError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSignUp = async () => {
        if (!isPasswordStrong) {
            setError("Please meet all password requirements.");
            return;
        }
        setLoading(true);
        setError('');
        if (password !== retypePassword) {
            setError("Passwords do not match");
            setLoading(false);
            return;
        }
        if (!dob) {
            setError("Date of birth is required");
            setLoading(false);
            return;
        }
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            // Send confirmation email
            try {
                await fetch('/api/send-confirmation-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: email, 
                        name: firstName || email.split('@')[0] 
                    }),
                });
            } catch (emailErr) {
                console.error("Failed to send confirmation email", emailErr);
                // We don't block the user if email fails, but we log it
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const additionalInfo = getAdditionalUserInfo(result);
            
            if (additionalInfo?.isNewUser) {
                // Send confirmation email for new Google users
                try {
                    await fetch('/api/send-confirmation-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            email: result.user.email, 
                            name: result.user.displayName?.split(' ')[0] || result.user.email?.split('@')[0] 
                        }),
                    });
                } catch (emailErr) {
                    console.error("Failed to send confirmation email", emailErr);
                }
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const ValidationItem = ({ label, met }: { label: string; met: boolean }) => (
        <div className={`flex items-center gap-2 text-xs transition-colors duration-300 ${met ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
            <div className={`w-3 h-3 rounded-full border ${met ? 'bg-green-500 border-green-400' : 'border-gray-600'} transition-all`}></div>
            <span>{label}</span>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 auth-modal-backdrop text-white">
            <div className="apple-ui-card p-8 rounded-[2.5rem] shadow-2xl shadow-blue-500/10 max-w-sm w-full relative border border-white/10 overflow-y-auto max-h-[90vh]">
                <header className="flex flex-col items-center justify-center mb-8 text-center">
                    <h1 className="text-4xl font-extrabold gradient-text tracking-tight">FinDash</h1>
                    <p className="text-gray-400 mt-2 text-sm">
                        {view === 'signin' ? 'Welcome to FinDash' : 'Create your account'}
                    </p>
                </header>

                {error && <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl text-center">{error}</div>}

                {view === 'signin' ? (
                    <div className="space-y-4">
                        <input 
                            type="email" placeholder="Email Address" 
                            value={email} onChange={e => setEmail(e.target.value)}
                            className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder-gray-500" 
                        />
                        <input 
                            type="password" placeholder="Password" 
                            value={password} onChange={e => setPassword(e.target.value)}
                            className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder-gray-500" 
                        />
                        <button 
                            onClick={handleSignIn}
                            disabled={loading}
                            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 transition-all flex items-center justify-center disabled:opacity-50 active:scale-95 shadow-lg shadow-blue-600/20"
                        >
                            {loading ? <div className="spinner !w-4 !h-4 !border-2"></div> : 'Sign In'}
                        </button>
                        <div className="flex items-center justify-center my-6"><span className="h-px bg-white/10 flex-1"></span><span className="px-4 text-xs text-gray-500 uppercase font-bold tracking-widest">OR</span><span className="h-px bg-white/10 flex-1"></span></div>
                        <button onClick={handleGoogleSignIn} disabled={loading} className="w-full bg-white/5 text-white font-bold py-4 rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-3 border border-white/10">
                            <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.519-3.487-11.187-8.264l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.01,35.61,44,30.038,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>
                            Sign In with Google
                        </button>
                        <p className="text-center text-sm text-gray-400 mt-8">
                            New here? <button onClick={() => setView('signup')} className="font-bold text-blue-500 hover:underline transition-all">Create Account</button>
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <input type="text" placeholder="First" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-gray-500" />
                            <input type="text" placeholder="Last" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-gray-500" />
                        </div>
                        <div className="relative group pt-1">
                             <div className="absolute -top-1.5 left-3 bg-[#1c1c1e] px-1 z-10 text-[10px] text-gray-500 uppercase font-bold">Date of Birth</div>
                             <input 
                                type="date" 
                                value={dob} 
                                onChange={e => setDob(e.target.value)} 
                                className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-gray-500 appearance-none min-h-[56px] [color-scheme:dark]"
                             />
                        </div>
                        <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-gray-500" />
                        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder-gray-500" />
                        
                        {/* Password Checklist */}
                        <div className="bg-black/20 p-4 rounded-2xl border border-white/5 space-y-2">
                            <ValidationItem label="8+ characters" met={passValid.length} />
                            <ValidationItem label="One uppercase letter" met={passValid.upper} />
                            <ValidationItem label="One number" met={passValid.number} />
                            <ValidationItem label="One symbol (!@#$)" met={passValid.symbol} />
                        </div>

                        <input type="password" placeholder="Retype Password" value={retypePassword} onChange={e => setRetypePassword(e.target.value)} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder-gray-500" />
                        
                        <button 
                            onClick={handleSignUp} 
                            disabled={loading || !isPasswordStrong} 
                            className={`w-full font-bold py-4 rounded-2xl transition-all flex items-center justify-center active:scale-95 shadow-lg ${isPasswordStrong ? 'bg-blue-600 text-white shadow-blue-600/20' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
                        >
                            {loading ? <div className="spinner !w-4 !h-4 !border-2"></div> : 'Create Account'}
                        </button>
                        <p className="text-center text-sm text-gray-400 mt-6">
                            Already registered? <button onClick={() => setView('signin')} className="font-bold text-blue-500 hover:underline transition-all">Sign In</button>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuthModal;