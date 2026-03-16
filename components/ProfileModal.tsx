import React, { useState, useEffect } from 'react';
import { User, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

interface ProfileModalProps {
    user: User;
    onClose: () => void;
}

interface UserProfile {
    firstName: string;
    lastName: string;
    photoURL: string;
    phoneNumber: string;
    dob: string;
    address: string;
    city: string;
    state: string;
    country: string;
    bio: string;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ user, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Form State
    const [profile, setProfile] = useState<UserProfile>({
        firstName: '',
        lastName: '',
        photoURL: '',
        phoneNumber: '',
        dob: '',
        address: '',
        city: '',
        state: '',
        country: '',
        bio: ''
    });

    // Initial Fetch
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const docRef = doc(db, `artifacts/default-app-id/users/${user.uid}/profile/details`);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const data = docSnap.data() as UserProfile;
                    setProfile({
                        ...data
                    });
                } else {
                    const parts = (user.displayName || '').split(' ');
                    setProfile(prev => ({
                        ...prev,
                        firstName: parts[0] || '',
                        lastName: parts.slice(1).join(' ') || '',
                        phoneNumber: user.phoneNumber || '',
                        photoURL: user.photoURL || ''
                    }));
                }
            } catch (e) {
                console.error("Error fetching profile", e);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [user]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const docRef = doc(db, `artifacts/default-app-id/users/${user.uid}/profile/details`);
            await setDoc(docRef, profile, { merge: true });
            
            // Sync key fields back to Auth Profile if changed
            if (profile.firstName || profile.lastName) {
                 await updateProfile(user, {
                     displayName: `${profile.firstName} ${profile.lastName}`.trim()
                 });
            }
            
            onClose();
        } catch (e) {
            console.error("Error saving profile", e);
            alert("Failed to save profile changes. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <div className="spinner !w-10 !h-10 !border-4"></div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
             <div className="bg-[#1c1c1e] w-full max-w-2xl rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/5 backdrop-blur-md">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Account Settings</h2>
                        <p className="text-sm text-gray-400">Manage your personal information</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                {/* Body */}
                <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                    {/* Identity Section */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                        <div className="flex flex-col items-center gap-3">
                            <div 
                                className="w-28 h-28 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-4xl font-bold text-white shadow-2xl shadow-blue-500/20 border-4 border-[#1c1c1e] relative overflow-hidden"
                            >
                                {profile.photoURL ? (
                                    <img src={profile.photoURL} key={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    (profile.firstName ? profile.firstName[0] : (user.email?.[0] || '?')).toUpperCase()
                                )}
                            </div>
                        </div>
                        
                        <div className="flex-1 w-full space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Email Address (ID)</label>
                                <div className="w-full bg-black/20 border border-white/5 rounded-xl p-3 text-gray-400 text-sm flex items-center gap-2 cursor-not-allowed">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                    {user.email}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">First Name</label>
                                    <input 
                                        type="text" 
                                        value={profile.firstName} 
                                        onChange={e => setProfile({...profile, firstName: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500/50 outline-none transition-all placeholder-gray-600"
                                        placeholder="Enter first name"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Last Name</label>
                                    <input 
                                        type="text" 
                                        value={profile.lastName} 
                                        onChange={e => setProfile({...profile, lastName: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500/50 outline-none transition-all placeholder-gray-600"
                                        placeholder="Enter last name"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-white/5"></div>

                    {/* Contact & Bio */}
                    <div className="space-y-6">
                        <h3 className="text-lg font-bold text-white">Contact & Information</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Phone Number</label>
                                <input 
                                    type="tel" 
                                    value={profile.phoneNumber} 
                                    onChange={e => setProfile({...profile, phoneNumber: e.target.value})}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500/50 outline-none transition-all placeholder-gray-600 min-h-[50px]"
                                    placeholder="+1 234 567 8900"
                                />
                            </div>
                             <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Date of Birth</label>
                                <div className="relative">
                                    <input 
                                        type="date" 
                                        value={profile.dob} 
                                        onChange={e => setProfile({...profile, dob: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pl-11 text-white focus:ring-2 focus:ring-blue-500/50 outline-none transition-all [color-scheme:dark] min-h-[50px] appearance-none"
                                    />
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Address</label>
                            <input 
                                type="text"
                                value={profile.address} 
                                onChange={e => setProfile({...profile, address: e.target.value})}
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500/50 outline-none transition-all placeholder-gray-600 mb-3"
                                placeholder="Street Address"
                            />
                            
                            {/* Manual Inputs for City, State, Country */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">City</label>
                                    <input 
                                        type="text" 
                                        value={profile.city}
                                        onChange={e => setProfile({...profile, city: e.target.value})}
                                        placeholder="City"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500/50 outline-none min-h-[50px]"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">State / Region</label>
                                    <input 
                                        type="text" 
                                        value={profile.state} 
                                        onChange={e => setProfile({...profile, state: e.target.value})}
                                        placeholder="State"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500/50 outline-none min-h-[50px]"
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Country</label>
                                <input 
                                    type="text" 
                                    value={profile.country} 
                                    onChange={e => setProfile({...profile, country: e.target.value})}
                                    placeholder="Country"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500/50 outline-none min-h-[50px]"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Bio / Notes</label>
                             <textarea 
                                value={profile.bio} 
                                onChange={e => setProfile({...profile, bio: e.target.value})}
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500/50 outline-none transition-all min-h-[100px] placeholder-gray-600 resize-none"
                                placeholder="Tell us about your business or add personal notes..."
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-black/20 flex gap-4">
                    <button onClick={onClose} className="flex-1 py-4 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors">Discard Changes</button>
                    <button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="flex-1 py-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                        {saving ? <div className="spinner !w-5 !h-5 !border-2"></div> : 'Save Profile'}
                    </button>
                </div>
             </div>
        </div>
    );
};
export default ProfileModal;