import type {Metadata} from 'next';
import JudgeDemo from './JudgeDemo';
import './demo.css';
export const metadata:Metadata={title:'CampusOS | Judge Demo',description:'Explore campus events, smart IDs and Crew Sync in an interactive demonstration.'};
export default function Page(){return <JudgeDemo/>;}
