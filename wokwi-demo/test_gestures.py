"""Compile and exercise actual firmware gesture functions with a small host adapter.

No copied algorithm: fragments are extracted from sketch.ino at test execution.
Run: python wokwi-demo/test_gestures.py (requires g++ on PATH).
"""
from pathlib import Path
import subprocess
import shutil

root = Path(__file__).resolve().parent
source = (root / "sketch.ino").read_text(encoding="utf-8")

def between(start, end):
    return source[source.index(start):source.index(end, source.index(start))]

fragments = [between("namespace Config {", "enum class LocalState"),
             between("enum class LocalState", "// One daisy-chain"),
             between("bool elapsed(", "bool stateFromText"),
             between("bool isWaiting(", "// Worker-only flash writing;"),
             between("bool suspiciousPress(", "void applyCommand(")]
adapter = r'''
#include <cstdint>
#include <cstring>
#include <vector>
#include <string>
#include <iostream>
#include <cassert>
#define HIGH true
#define LOW false
static bool pinLevel=HIGH;
static uint32_t fakeNow=0;
static std::vector<std::string> events;
static std::vector<std::string> gestures;
bool digitalRead(uint8_t) { return pinLevel; }
uint32_t millis() { return fakeNow; }
'''
types = r'''
struct LogicalKiosk {
 uint8_t buttonPin=18; LocalState localState=LocalState::READY;
 GestureDetector gestureDetector;
 uint32_t suspiciousPresses[Config::SPAM_LIMIT]={}; uint8_t suspiciousCount=0;
 uint32_t lockStartedAt=0,lockDuration=0;
 bool requestOutstanding=false;
};
const Note REQUEST_SOUND[]={{1400,90}},INVALID_SOUND[]={{300,100}};
void playSound(const Note*,uint8_t) {}
bool enqueueEvent(LogicalKiosk&,const char*event,const char*gesture=nullptr,
 const char*intent=nullptr,const char*rating=nullptr,const char*cmdId=nullptr) {
 events.push_back(std::string(event)+":"+(intent?intent:rating?rating:""));
 (void)cmdId;
 if(gesture) gestures.push_back(gesture);
 return true;
}
'''
tests = r'''
void feed(LogicalKiosk &k,bool raw,uint32_t at) {fakeNow=at;pinLevel=raw;updateButton(k,at);}
void press(LogicalKiosk &k,uint32_t start,uint32_t duration) {
 feed(k,LOW,start);feed(k,LOW,start+50);feed(k,HIGH,start+duration);feed(k,HIGH,start+duration+50);
}
void clear(){events.clear();gestures.clear();pinLevel=HIGH;}
int main() {
 for(auto duration:{100U,799U,800U,1499U,1500U}) {
  clear();LogicalKiosk k;press(k,1000,duration);feed(k,HIGH,1000+duration+451);
  assert(events.size()==1);
  assert(events[0]==(duration<800?"REQUEST:CONSULTATION":duration<1500?"INVALID_GESTURE:":"REQUEST:PAYMENT"));
 }
 clear();LogicalKiosk bounce;feed(bounce,LOW,1000);feed(bounce,HIGH,1020);feed(bounce,HIGH,1100);assert(events.empty());
 clear();LogicalKiosk cancel;cancel.localState=LocalState::PENDING;press(cancel,1000,100);press(cancel,1250,100);
 assert(events.size()==1&&events[0]=="CANCEL_REQUEST:"&&gestures[0]=="double");
 clear();LogicalKiosk arrival;arrival.localState=LocalState::ACKNOWLEDGED;press(arrival,1000,100);
 assert(events.size()==1&&events[0]=="STAFF_ARRIVED:");
 clear();LogicalKiosk satisfied;satisfied.localState=LocalState::CSAT_WAIT;press(satisfied,1000,100);
 assert(events.size()==1&&events[0]=="CSAT:SATISFIED");
 clear();LogicalKiosk unhappy;unhappy.localState=LocalState::CSAT_WAIT;press(unhappy,1000,1500);
 assert(events.size()==1&&events[0]=="CSAT:UNSATISFIED");
 clear();LogicalKiosk wrap;uint32_t start=UINT32_MAX-200;press(wrap,start,100);feed(wrap,HIGH,start+551);
 assert(events.size()==1&&events[0]=="REQUEST:CONSULTATION");
 clear();LogicalKiosk spam;spam.localState=LocalState::PENDING;
 for(uint32_t i=0;i<5;i++){press(spam,1000+i*700,100);feed(spam,HIGH,1551+i*700);}
 assert(spam.lockDuration==Config::SPAM_LOCK_MS);
 bool locked=false;for(auto &event:events)if(event=="SPAM_DETECTED:")locked=true;assert(locked);
 size_t before=events.size();press(spam,5000,1500);assert(events.size()==before);
 clear();LogicalKiosk sparse;sparse.localState=LocalState::PENDING;
 for(uint32_t i=0;i<5;i++){press(sparse,1000+i*11000,100);feed(sparse,HIGH,1551+i*11000);}
 assert(sparse.lockDuration==0);
 clear();LogicalKiosk legitimate;
 for(uint32_t i=0;i<6;i++){
   legitimate.localState=LocalState::READY;legitimate.requestOutstanding=false;
   press(legitimate,1000+i*1000,100);feed(legitimate,HIGH,1551+i*1000);
 }
 assert(legitimate.suspiciousCount==0&&legitimate.lockDuration==0);
 std::cout<<"PASS 14 firmware gesture/threshold/arrival/CSAT/debounce/wrap/spam assertions\n";
}
'''
build = root / ".build-tools"
build.mkdir(exist_ok=True)
path = build / "gesture-test.cpp"
path.write_text(adapter + fragments[0] + fragments[1] + types + "".join(fragments[2:]) + tests, encoding="utf-8")
compiler = shutil.which("g++")
if not compiler:
    raise SystemExit("g++ is required for host gesture tests")
executable = build / "gesture-test.exe"
subprocess.run([compiler, "-std=c++17", "-Wall", "-Wextra", str(path), "-o", str(executable)], check=True)
subprocess.run([str(executable)], check=True)
