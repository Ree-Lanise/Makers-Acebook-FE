const request = require("supertest");
const JWT = require("jsonwebtoken");

const app = require("../../app");
const Post = require("../../models/post");
const User = require("../../models/user");
const fs = require('fs');
const path = require('path');

require("../mongodb_helper");

const secret = process.env.JWT_SECRET;

const createToken = (userId) => {
  return JWT.sign(
    {
      user_id: userId,
      // Backdate this token of 5 minutes
      iat: Math.floor(Date.now() / 1000) - 5 * 60,
      // Set the JWT token to expire in 10 minutes
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
    },
    secret
  );
};

let token;
describe("/posts", () => {
  beforeAll(async () => {
    const user = new User({
      firstName: "testFirstName",
      lastName: "testLastName",
      email: "post-test@test.com",
      password: "12345678",
    });
    await user.save();
    await Post.deleteMany({});
    token = createToken(user.id);
  });

  afterEach(async () => {
    await Post.deleteMany({});
  });

  describe("POST, when a valid token is present", () => {
    test("responds with a 201", async () => {
      const response = await request(app)
        .post("/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ message: "Hello World!" });
      expect(response.status).toEqual(201);
    });

    test("creates a new post", async () => {
      await request(app)
        .post("/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ message: "Hello World!!" });

      const posts = await Post.find();
      expect(posts.length).toEqual(1);
      expect(posts[0].message).toEqual("Hello World!!");
    });

    test("returns a new token", async () => {
      const testApp = request(app);
      const response = await testApp
        .post("/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ message: "hello world" });

      const newToken = response.body.token;
      const newTokenDecoded = JWT.decode(newToken, process.env.JWT_SECRET);
      const oldTokenDecoded = JWT.decode(token, process.env.JWT_SECRET);

      // iat stands for issued at
      expect(newTokenDecoded.iat > oldTokenDecoded.iat).toEqual(true);
    });
  });

  describe("POST, when token is missing", () => {
    test("responds with a 401", async () => {
      const response = await request(app)
        .post("/posts")
        .send({ message: "hello again world" });

      expect(response.status).toEqual(401);
    });

    test("a post is not created", async () => {
      const response = await request(app)
        .post("/posts")
        .send({ message: "hello again world" });

      const posts = await Post.find();
      expect(posts.length).toEqual(0);
    });

    test("a token is not returned", async () => {
      const response = await request(app)
        .post("/posts")
        .send({ message: "hello again world" });

      expect(response.body.token).toEqual(undefined);
    });
  });

  describe("GET tests", () => {
    beforeEach(async () => {
      const post1 = new Post({ 
        userId: "testId",
        firstName: "testFirstName",
        lastName: "testLastName",
        message: "I love all my children equally" 
      });
      const post2 = new Post({ 
        userId: "testId",
        firstName: "testFirstName",
        lastName: "testLastName",
        message: "I've never cared for GOB" 
      });
      await post1.save();
      await post2.save();
    });

    describe("GET, when token is present", () => {
      test("the response code is 200", async () => {
        const response = await request(app)
          .get("/posts")
          .set("Authorization", `Bearer ${token}`);

        expect(response.status).toEqual(200);
      });

      test("returns every post in the collection", async () => {
        const response = await request(app)
          .get("/posts")
          .set("Authorization", `Bearer ${token}`);

        const posts = response.body.posts;
        const firstPost = posts[0];
        const secondPost = posts[1];

        expect(firstPost.message).toEqual("I love all my children equally");
        expect(secondPost.message).toEqual("I've never cared for GOB");
      });

      test("returns a new token", async () => {
        const response = await request(app)
          .get("/posts")
          .set("Authorization", `Bearer ${token}`);

        const newToken = response.body.token;
        const newTokenDecoded = JWT.decode(newToken, process.env.JWT_SECRET);
        const oldTokenDecoded = JWT.decode(token, process.env.JWT_SECRET);

        // iat stands for issued at
        expect(newTokenDecoded.iat > oldTokenDecoded.iat).toEqual(true);
      });
    });

    describe("GET, when token is missing", () => {
      test("the response code is 401", async () => {
        const response = await request(app).get("/posts");

        expect(response.status).toEqual(401);
      });

      test("returns no posts", async () => {
        const response = await request(app).get("/posts");

        expect(response.body.posts).toEqual(undefined);
      });

      test("does not return a new token", async () => {
        const response = await request(app).get("/posts");

        expect(response.body.token).toEqual(undefined);
      });
    });
  
    describe("Get with query parameter", () => {
      beforeAll(async () => {
        const user2 = new User({
          firstName: "testFirstName",
          lastName: "testLastName",
          email: "post-test@test.com",
          password: "12345678",
        });
        await user2.save();
        
        const postToFind = new Post({ 
          userId: `${user2.id}`,
          firstName: "testFirstName",
          lastName: "testLastName",
          message: "Post" 
        });
        await postToFind.save()
        newToken = createToken(user2.id);
      })
        
      test("returns some posts with parameter set to true, not all posts", async () => {
        
        const response = await request(app)
          .get("/posts?profile=true")
          .set("Authorization", `Bearer ${newToken}`);
        const thePost = response.body.posts;
        expect(thePost[0].message).toEqual("Post")

      });
    });

    test("test if post has image, without token", async () => {
      const post1 = new Post({ 
        userId: "testId",
        firstName: "testFirstName",
        lastName: "testLastName",
        message: "howdy!", 
        image: "/uploads/0c1cbe94-0240-439b-b1f4-8386d92a7d16smiley.png"
      });

      await post1.save();

      const response = await request(app).get("/posts");
        expect(response.image).toBeUndefined();
    });

    test("test if post has image, with token", async () => {
      const post1 = new Post({ 
        userId: "testId",
        firstName: "testFirstName",
        lastName: "testLastName",
        message: "howdy!", 
        image: "/uploads/1b240fea-8aee-45b4-9a72-1c5df06835f5smiley.png"})
      
      await post1.save();

      const response = await request(app)
        .get("/posts")
        .set("Authorization", `Bearer ${token}`);
        
        expect(response.status).toEqual(200);
        expect(response.body.posts[0].image).toEqual("/uploads/1b240fea-8aee-45b4-9a72-1c5df06835f5smiley.png");
    });
  });

  });


