// static/js/globals.d.ts

// Declare global libraries loaded via CDN
declare var vis: any;
declare var Vue: any;

// Extend the Window interface
interface Window {
    graphData: any;
}

// Fix for strict Vue checking in JS files
// This helps TS understand that 'this' inside the object is not just the object literal
type ComponentInstance = {
    [key: string]: any;
}
