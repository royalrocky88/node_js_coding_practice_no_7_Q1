// ---------------------------DB Initialization------------------------------------
const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();

//-----------------------------Object------------------------
const convertDBStateObj = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDBDistrictObj = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

//--------------------------login--------------------------
//-------------------API 1 ------------------------------
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectedUserQuery = `SELECT * FROM user
    WHERE username = '${username}'
    `;

  const dbUser = await db.get(selectedUserQuery);

  if (dbUser === undefined) {
    //------unregistered user tries to login then [Invalid User]------
    response.status(400);
    response.send("Invalid User");
  } else {
    //------Checking Password Match or Not--------
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      //   response.send("Login Successful !");

      //----Generate JwtToken use  [jwt.sign()]-------------
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "findpwd");
      response.send({ jwtToken });
      //-----------------------------------------------------
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

//-------------API 1 [Authentication with Token]-------------------
app.get("/states/", async (request, response) => {
  const authHeader = request.headers["authorization"];

  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "findpwd", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        const getStateQuery = `
                SELECT * FROM state;
                `;

        const stateArray = await db.all(getStateQuery);
        response.send(stateArray);
      }
    });
  }
});

//--------------Create MiddleWare Function----------------
function middleWare(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "findpwd", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid Access Token");
      } else {
        next();
      }
    });
  }
}

//----------------------API 2 list of all states ----------------------
app.get("/states/", middleWare, async (request, response) => {
  const getState = `SELECT * FROM state;
    `;
  const allState = await db.all(getState);
  response.send(allState.map((eachState) => convertDBStateObj(eachState)));
});

//--------------------API 3 state based on the state ID----------------
app.get("/states/:stateId/", middleWare, async (request, response) => {
  const { stateId } = request.params;

  const getStateId = `
    SELECT * FROM state
    WHERE state_id = '${stateId}';
    `;

  const stateQuery = await db.get(getStateId);
  response.send(convertDBStateObj(stateQuery));
});

//------API 4 Create a district in the district table, district_id------
app.post("/districts/", middleWare, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;

  const insertDetails = `INSERT INTO district (
        district_name,
        state_id,
        cases,
        cured,
        active,
        deaths)
        VALUES(
            '${districtName}',
            ${stateId},
            ${cases},
            ${cured},
            ${active},
            ${deaths}
        );
    `;

  await db.run(insertDetails);

  response.send("District Successfully Added");
});

//-----API 5 district based on the district ID-------------------
app.get("/districts/:districtId/", middleWare, async (request, response) => {
  const { districtId } = request.params;

  const selectDistQuery = `
    SELECT * FROM district
    WHERE district_id = '${districtId}';
    `;

  const showDistrict = await db.get(selectDistQuery);

  response.send(convertDBDistrictObj(showDistrict));
});

//-------------API 6 Deletes a district ID-----------------
app.delete("/districts/:districtId/", middleWare, async (request, response) => {
  const { districtId } = request.params;

  const removeDistId = `
    DELETE FROM district
    WHERE district_id = '${districtId}';
    `;

  await db.run(removeDistId);

  response.send("District Remove");
});

//-----API 7 Updates details specific district by district ID-----------
app.put("/districts/:districtId/", middleWare, async (request, response) => {
  const { districtId } = request.params;

  const { districtName, stateId, cases, cured, active, deaths } = request.body;

  const updateDistDetail = `
    UPDATE district
    SET 
    district_name = '${districtName}',
    state_id = '${stateId}',
    cases = '${cases}',
    cured = '${cured}',
    active = '${active}',
    deaths = '${deaths}'
    WHERE district_id = ${districtId};
    `;

  await db.run(updateDistDetail);

  response.send("District Details Updated");
});

//----API 8 total stats cases, cured, active, deaths by state ID---------
app.get("/states/:stateId/stats/", middleWare, async (request, response) => {
  const { stateId } = request.params;

  const totalStats = `
    SELECT SUM(cases), SUM(cured), SUM(active), SUM(deaths)
    FROM district
    WHERE state_id = '${stateId}';
    `;

  const statsDetail = await db.get(totalStats);
  response.send({
    totalCases: statsDetail["SUM(cases)"],
    totalCured: statsDetail["SUM(cured)"],
    totalActive: statsDetail["SUM(active)"],
    totalDeaths: statsDetail["SUM(deaths)"],
  });
});

module.exports = app;
